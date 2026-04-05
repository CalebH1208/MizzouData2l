package Backend

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/transfermanager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// CloudConfig holds credentials loaded from cloud_config.json.
type CloudConfig struct {
	AccessKeyID     string `json:"aws_access_key_id"`
	SecretAccessKey string `json:"aws_secret_access_key"`
	BucketName      string `json:"bucket_name"`
	Region          string `json:"region"`
	DisplayName     string `json:"display_name"` // user's name shown as uploader
}

// CloudFileInfo describes a file or virtual folder in S3.
type CloudFileInfo struct {
	Name       string            `json:"name"`
	Key        string            `json:"key"`    // full S3 object key
	Prefix     string            `json:"prefix"` // parent prefix (virtual dir)
	IsDir      bool              `json:"is_dir"`
	Size       int64             `json:"size"`
	UploadedAt string            `json:"uploaded_at"`
	UploadedBy string            `json:"uploaded_by"` // from object metadata
	ETag       string            `json:"etag"`
	Tags       map[string]string `json:"tags"` // structured tags from S3 metadata
}

// TransferProgress is the Wails event payload emitted during upload/download.
type TransferProgress struct {
	Filename   string `json:"filename"`
	BytesDone  int64  `json:"bytes_done"`
	BytesTotal int64  `json:"bytes_total"`
	Direction  string `json:"direction"` // "upload" or "download"
}

// ConflictInfo is returned when a cloud file is newer than the local downloaded version.
// Status: "none" (no conflict), "cloud-newer" (only cloud changed), "conflict" (both changed).
type ConflictInfo struct {
	Status      string `json:"status"`
	HasConflict bool   `json:"has_conflict"`
	UploadedBy  string `json:"uploaded_by"`
	UploadedAt  string `json:"uploaded_at"`
}

// Cloud_storage provides Wails-bound S3 operations.
type Cloud_storage struct {
	ctx       context.Context
	config    *CloudConfig
	s3Client  *s3.Client
	tmClient  *transfermanager.Client
	syncState *Sync_state
}

func New_cloud_storage(ss *Sync_state) *Cloud_storage {
	cs := &Cloud_storage{syncState: ss}
	cs.tryLoadConfig()
	return cs
}

// SetContext is called by Wails startup to give us the runtime context.
func (cs *Cloud_storage) SetContext(ctx context.Context) {
	cs.ctx = ctx
}

// IsConfigured returns true when cloud_config.json was loaded successfully.
func (cs *Cloud_storage) IsConfigured() bool {
	return cs.config != nil && cs.s3Client != nil
}

// GetDisplayName returns the configured user display name.
func (cs *Cloud_storage) GetDisplayName() string {
	if cs.config == nil {
		return ""
	}
	return cs.config.DisplayName
}

// CurrentConfigInfo is returned by GetCurrentConfig for pre-populating the setup modal.
type CurrentConfigInfo struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretKeyMasked string `json:"secret_key_masked"` // always "••••••••", never the real value
	BucketName      string `json:"bucket_name"`
	Region          string `json:"region"`
	DisplayName     string `json:"display_name"`
	IsConfigured    bool   `json:"is_configured"`
}

// GetCurrentConfig returns the active config with the secret key masked.
func (cs *Cloud_storage) GetCurrentConfig() CurrentConfigInfo {
	if cs.config == nil {
		return CurrentConfigInfo{}
	}
	return CurrentConfigInfo{
		AccessKeyID:     cs.config.AccessKeyID,
		SecretKeyMasked: "••••••••",
		BucketName:      cs.config.BucketName,
		Region:          cs.config.Region,
		DisplayName:     cs.config.DisplayName,
		IsConfigured:    true,
	}
}

// Configure (re)loads the config from the given values and saves them to disk.
// Pass an empty secretAccessKey to keep the existing secret unchanged.
func (cs *Cloud_storage) Configure(accessKeyID, secretAccessKey, bucketName, region, displayName string) error {
	secret := secretAccessKey
	if secret == "" && cs.config != nil {
		secret = cs.config.SecretAccessKey
	}
	cfg := &CloudConfig{
		AccessKeyID:     accessKeyID,
		SecretAccessKey: secret,
		BucketName:      bucketName,
		Region:          region,
		DisplayName:     displayName,
	}
	if err := cs.initClient(cfg); err != nil {
		return err
	}
	cs.config = cfg
	return cs.saveConfig()
}

// ListFiles returns direct children of the given S3 prefix.
// Pass prefix="" for the bucket root.
func (cs *Cloud_storage) ListFiles(prefix string) ([]CloudFileInfo, error) {
	if !cs.IsConfigured() {
		return nil, fmt.Errorf("cloud storage not configured")
	}

	// Ensure prefix ends with "/" unless it's the root
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(cs.config.BucketName),
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
	}

	var result []CloudFileInfo
	paginator := s3.NewListObjectsV2Paginator(cs.s3Client, input)
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(context.Background())
		if err != nil {
			return nil, fmt.Errorf("failed to list files: %w", err)
		}

		// Virtual directories (common prefixes)
		for _, cp := range page.CommonPrefixes {
			key := aws.ToString(cp.Prefix)
			name := strings.TrimSuffix(strings.TrimPrefix(key, prefix), "/")
			if name == "" {
				continue
			}
			result = append(result, CloudFileInfo{
				Name:   name,
				Key:    key,
				Prefix: prefix,
				IsDir:  true,
			})
		}

		// Files
		for _, obj := range page.Contents {
			key := aws.ToString(obj.Key)
			// Skip placeholder objects for virtual directories
			if strings.HasSuffix(key, "/") {
				continue
			}
			name := strings.TrimPrefix(key, prefix)
			if name == "" || strings.Contains(name, "/") {
				continue
			}

			info := CloudFileInfo{
				Name:   name,
				Key:    key,
				Prefix: prefix,
				IsDir:  false,
				Size:   aws.ToInt64(obj.Size),
				ETag:   strings.Trim(aws.ToString(obj.ETag), `"`),
			}
			if obj.LastModified != nil {
				info.UploadedAt = obj.LastModified.UTC().Format(time.RFC3339)
			}

			result = append(result, info)
		}
	}

	// Directories first, then files, alphabetical
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

// GetCloudFileMeta returns metadata for a single S3 object.
func (cs *Cloud_storage) GetCloudFileMeta(key string) (CloudFileInfo, error) {
	if !cs.IsConfigured() {
		return CloudFileInfo{}, fmt.Errorf("cloud storage not configured")
	}
	head, err := cs.s3Client.HeadObject(context.Background(), &s3.HeadObjectInput{
		Bucket: aws.String(cs.config.BucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return CloudFileInfo{}, fmt.Errorf("failed to get file metadata: %w", err)
	}
	info := CloudFileInfo{
		Key:        key,
		Name:       filepath.Base(key),
		Size:       aws.ToInt64(head.ContentLength),
		ETag:       strings.Trim(aws.ToString(head.ETag), `"`),
		UploadedBy: head.Metadata["uploaded-by"],
		Tags:       make(map[string]string),
	}
	if head.LastModified != nil {
		info.UploadedAt = head.LastModified.UTC().Format(time.RFC3339)
	}
	for k, v := range head.Metadata {
		if strings.HasPrefix(k, "tag-") {
			info.Tags[strings.TrimPrefix(k, "tag-")] = v
		}
	}
	return info, nil
}

// CheckConflict returns whether the cloud version is newer than what was last downloaded locally.
// Status is "none", "cloud-newer" (only cloud changed), or "conflict" (both local and cloud changed).
func (cs *Cloud_storage) CheckConflict(cloudKey, localPath string) (ConflictInfo, error) {
	record := cs.syncState.GetDownloadRecord(localPath)
	if record.CloudKey == "" {
		return ConflictInfo{Status: "none"}, nil
	}

	meta, err := cs.GetCloudFileMeta(cloudKey)
	if err != nil {
		return ConflictInfo{Status: "none"}, nil
	}

	uploadedAt, err1 := time.Parse(time.RFC3339, meta.UploadedAt)
	downloadedAt, err2 := time.Parse(time.RFC3339, record.DownloadedAt)
	if err1 != nil || err2 != nil || !uploadedAt.After(downloadedAt) {
		return ConflictInfo{Status: "none"}, nil
	}

	// Cloud is newer. Check if local file was also modified since download.
	status := "cloud-newer"
	localStat, statErr := os.Stat(localPath)
	if statErr == nil && localStat.ModTime().After(downloadedAt) {
		status = "conflict"
	}

	return ConflictInfo{
		Status:      status,
		HasConflict: true,
		UploadedBy:  meta.UploadedBy,
		UploadedAt:  meta.UploadedAt,
	}, nil
}

// UploadFile starts an async upload of a local file to the given S3 key.
// Returns immediately; progress/completion/error emitted via events (matching DownloadFile pattern).
func (cs *Cloud_storage) UploadFile(localPath, cloudKey string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	if cs.ctx == nil {
		return fmt.Errorf("app context not ready")
	}

	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}

	stat, err := f.Stat()
	if err != nil {
		f.Close()
		return fmt.Errorf("failed to stat file: %w", err)
	}
	totalBytes := stat.Size()
	filename := filepath.Base(localPath)

	uploadMeta := cs.buildUploadMeta(localPath)

	listener := &uploadProgressListener{
		ctx:        cs.ctx,
		filename:   filename,
		totalBytes: totalBytes,
	}

	go func() {
		defer f.Close()
		_, err := cs.tmClient.UploadObject(context.Background(),
			&transfermanager.UploadObjectInput{
				Bucket:   aws.String(cs.config.BucketName),
				Key:      aws.String(cloudKey),
				Body:     f,
				Metadata: uploadMeta,
			},
			func(o *transfermanager.Options) {
				o.ObjectProgressListeners.Register(listener)
			},
		)
		if err != nil {
			runtime.EventsEmit(cs.ctx, "transfer:error", map[string]string{
				"filename":  filename,
				"direction": "upload",
				"error":     err.Error(),
			})
			return
		}
		runtime.EventsEmit(cs.ctx, "transfer:complete", map[string]string{
			"filename":  filename,
			"direction": "upload",
			"cloud_key": cloudKey,
		})
	}()
	return nil
}

// uploadFileSync performs a blocking upload (used by SyncFile which needs to update records after completion).
func (cs *Cloud_storage) uploadFileSync(localPath, cloudKey string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}

	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat file: %w", err)
	}
	filename := filepath.Base(localPath)
	uploadMeta := cs.buildUploadMeta(localPath)

	listener := &uploadProgressListener{
		ctx:        cs.ctx,
		filename:   filename,
		totalBytes: stat.Size(),
	}

	_, err = cs.tmClient.UploadObject(context.Background(),
		&transfermanager.UploadObjectInput{
			Bucket:   aws.String(cs.config.BucketName),
			Key:      aws.String(cloudKey),
			Body:     f,
			Metadata: uploadMeta,
		},
		func(o *transfermanager.Options) {
			o.ObjectProgressListeners.Register(listener)
		},
	)
	if err != nil {
		return fmt.Errorf("upload failed: %w", err)
	}
	return nil
}

func (cs *Cloud_storage) buildUploadMeta(localPath string) map[string]string {
	meta := map[string]string{
		"uploaded-by": cs.config.DisplayName,
	}
	if strings.HasSuffix(strings.ToUpper(localPath), ".MRTF") {
		tags, _, _ := ReadTagsOnly(localPath)
		for k, v := range tags.Categories {
			meta["tag-"+strings.ToLower(k)] = v
		}
	}
	return meta
}

// DownloadFile starts an async download of an S3 object to a local path.
// It returns immediately; progress is emitted via "transfer:progress" events,
// and completion/failure via "transfer:complete" / "transfer:error" events.
func (cs *Cloud_storage) DownloadFile(cloudKey, localPath string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	if cs.ctx == nil {
		return fmt.Errorf("app context not ready")
	}

	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	f, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}

	filename := filepath.Base(localPath)
	listener := &downloadProgressListener{
		ctx:      cs.ctx,
		filename: filename,
	}

	// Run the actual download in a goroutine so progress events can be
	// processed by the Wails JS bridge while the download is in flight.
	go func() {
		defer f.Close()
		out, err := cs.tmClient.DownloadObject(context.Background(),
			&transfermanager.DownloadObjectInput{
				Bucket:   aws.String(cs.config.BucketName),
				Key:      aws.String(cloudKey),
				WriterAt: f,
			},
			func(o *transfermanager.Options) {
				o.ObjectProgressListeners.Register(listener)
			},
		)
		if err != nil {
			_ = os.Remove(localPath)
			runtime.EventsEmit(cs.ctx, "transfer:error", map[string]string{
				"filename":  filename,
				"direction": "download",
				"error":     err.Error(),
			})
			return
		}
		etag := ""
		if out != nil && out.ETag != nil {
			etag = strings.Trim(*out.ETag, `"`)
		}
		cs.syncState.RecordDownload(cloudKey, localPath, etag)
		runtime.EventsEmit(cs.ctx, "transfer:complete", map[string]string{
			"filename":   filename,
			"direction":  "download",
			"local_path": localPath,
		})
	}()
	return nil
}

// DeleteCloudFile deletes an S3 object.
func (cs *Cloud_storage) DeleteCloudFile(key string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	_, err := cs.s3Client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(cs.config.BucketName),
		Key:    aws.String(key),
	})
	return err
}

// DeleteCloudFolder deletes an empty virtual folder. Returns an error if the folder has children.
func (cs *Cloud_storage) DeleteCloudFolder(prefix string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	// Check if folder has any children (other than its own placeholder)
	out, err := cs.s3Client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:  aws.String(cs.config.BucketName),
		Prefix:  aws.String(prefix),
		MaxKeys: aws.Int32(2),
	})
	if err != nil {
		return fmt.Errorf("failed to check folder contents: %w", err)
	}
	childCount := 0
	for _, obj := range out.Contents {
		if aws.ToString(obj.Key) != prefix {
			childCount++
		}
	}
	if childCount > 0 || len(out.CommonPrefixes) > 0 {
		return fmt.Errorf("folder is not empty")
	}
	// Delete the placeholder object
	_, err = cs.s3Client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(cs.config.BucketName),
		Key:    aws.String(prefix),
	})
	return err
}

// CreateCloudFolder creates a virtual folder by putting a zero-byte placeholder object.
func (cs *Cloud_storage) CreateCloudFolder(prefix string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	_, err := cs.s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:        aws.String(cs.config.BucketName),
		Key:           aws.String(prefix),
		ContentLength: aws.Int64(0),
	})
	return err
}

// CopyCloudFile copies an S3 object to a new key (keeping the original).
func (cs *Cloud_storage) CopyCloudFile(srcKey, dstKey string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	_, err := cs.s3Client.CopyObject(context.Background(), &s3.CopyObjectInput{
		Bucket:     aws.String(cs.config.BucketName),
		Key:        aws.String(dstKey),
		CopySource: aws.String(cs.config.BucketName + "/" + srcKey),
	})
	if err != nil {
		return fmt.Errorf("copy failed: %w", err)
	}
	return nil
}

// MoveToDeleted moves a cloud file to the top-level "Deleted/" prefix (soft delete).
func (cs *Cloud_storage) MoveToDeleted(key string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	name := path.Base(key)
	dstKey := "Deleted/" + name
	if err := cs.CopyCloudFile(key, dstKey); err != nil {
		return err
	}
	return cs.DeleteCloudFile(key)
}

// SyncFile uploads a local file back to its original cloud key and updates the sync record.
func (cs *Cloud_storage) SyncFile(localPath, cloudKey string) error {
	if err := cs.uploadFileSync(localPath, cloudKey); err != nil {
		return err
	}
	meta, err := cs.GetCloudFileMeta(cloudKey)
	etag := ""
	if err == nil {
		etag = meta.ETag
	}
	cs.syncState.RecordDownload(cloudKey, localPath, etag)
	return nil
}

// RenameCloudFile copies an object to a new key and deletes the old one.
func (cs *Cloud_storage) RenameCloudFile(oldKey, newKey string) error {
	if !cs.IsConfigured() {
		return fmt.Errorf("cloud storage not configured")
	}
	// S3 copy-then-delete
	_, err := cs.s3Client.CopyObject(context.Background(), &s3.CopyObjectInput{
		Bucket:     aws.String(cs.config.BucketName),
		Key:        aws.String(newKey),
		CopySource: aws.String(cs.config.BucketName + "/" + oldKey),
	})
	if err != nil {
		return fmt.Errorf("copy failed: %w", err)
	}
	return cs.DeleteCloudFile(oldKey)
}

// --- Private helpers ---

// Build-time injected credentials via -ldflags.
// Set by: go build -ldflags "-X MizzouDataTool/backend.defaultAccessKeyID=... -X MizzouDataTool/backend.defaultSecretAccessKey=..."
// See build.sh / .env.build for usage.
var (
	defaultAccessKeyID     string // injected at build time
	defaultSecretAccessKey string // injected at build time
	defaultBucketName      string // injected at build time
	defaultRegion          string // injected at build time
)

func (cs *Cloud_storage) tryLoadConfig() {
	path, err := cloudConfigPath()
	if err == nil {
		data, err := os.ReadFile(path)
		if err == nil {
			var cfg CloudConfig
			if jsonErr := json.Unmarshal(data, &cfg); jsonErr == nil {
				_ = cs.initClient(&cfg)
				cs.config = &cfg
				return
			}
		}
	}
	// Fall back to build-time injected defaults (set via -ldflags)
	if defaultAccessKeyID != "" && defaultSecretAccessKey != "" {
		cfg := &CloudConfig{
			AccessKeyID:     defaultAccessKeyID,
			SecretAccessKey: defaultSecretAccessKey,
			BucketName:      defaultBucketName,
			Region:          defaultRegion,
			DisplayName:     "Team Member",
		}
		if cfg.BucketName == "" {
			cfg.BucketName = "mizzou-racing-telemetry"
		}
		if cfg.Region == "" {
			cfg.Region = "us-east-2"
		}
		_ = cs.initClient(cfg)
		cs.config = cfg
	}
}

func (cs *Cloud_storage) initClient(cfg *CloudConfig) error {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
	)
	if err != nil {
		return fmt.Errorf("failed to initialize AWS config: %w", err)
	}
	cs.s3Client = s3.NewFromConfig(awsCfg)
	cs.tmClient = transfermanager.New(cs.s3Client)
	return nil
}

func (cs *Cloud_storage) saveConfig() error {
	path, err := cloudConfigPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(cs.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func cloudConfigPath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
	}
	return filepath.Join(filepath.Dir(exePath), "cloud_config.json"), nil
}

// --- Progress listener implementations ---

type uploadProgressListener struct {
	ctx        context.Context
	filename   string
	totalBytes int64
}

func (l *uploadProgressListener) OnObjectTransferStart(_ context.Context, e *transfermanager.ObjectTransferStartEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:progress", TransferProgress{
		Filename:   l.filename,
		BytesDone:  0,
		BytesTotal: e.TotalBytes,
		Direction:  "upload",
	})
}

func (l *uploadProgressListener) OnObjectBytesTransferred(_ context.Context, e *transfermanager.ObjectBytesTransferredEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:progress", TransferProgress{
		Filename:   l.filename,
		BytesDone:  e.BytesTransferred,
		BytesTotal: e.TotalBytes,
		Direction:  "upload",
	})
}

func (l *uploadProgressListener) OnObjectTransferComplete(_ context.Context, e *transfermanager.ObjectTransferCompleteEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:progress", TransferProgress{
		Filename:   l.filename,
		BytesDone:  e.BytesTransferred,
		BytesTotal: e.TotalBytes,
		Direction:  "upload",
	})
}

func (l *uploadProgressListener) OnObjectTransferFailed(_ context.Context, e *transfermanager.ObjectTransferFailedEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:error", map[string]string{
		"filename":  l.filename,
		"direction": "upload",
		"error":     e.Error.Error(),
	})
}

type downloadProgressListener struct {
	ctx      context.Context
	filename string
}

func (l *downloadProgressListener) OnObjectTransferStart(_ context.Context, e *transfermanager.ObjectTransferStartEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:progress", TransferProgress{
		Filename:   l.filename,
		BytesDone:  0,
		BytesTotal: e.TotalBytes,
		Direction:  "download",
	})
}

func (l *downloadProgressListener) OnObjectBytesTransferred(_ context.Context, e *transfermanager.ObjectBytesTransferredEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:progress", TransferProgress{
		Filename:   l.filename,
		BytesDone:  e.BytesTransferred,
		BytesTotal: e.TotalBytes,
		Direction:  "download",
	})
}

func (l *downloadProgressListener) OnObjectTransferComplete(_ context.Context, e *transfermanager.ObjectTransferCompleteEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:progress", TransferProgress{
		Filename:   l.filename,
		BytesDone:  e.BytesTransferred,
		BytesTotal: e.TotalBytes,
		Direction:  "download",
	})
}

func (l *downloadProgressListener) OnObjectTransferFailed(_ context.Context, e *transfermanager.ObjectTransferFailedEvent) {
	if l.ctx == nil {
		return
	}
	runtime.EventsEmit(l.ctx, "transfer:error", map[string]string{
		"filename":  l.filename,
		"direction": "download",
		"error":     e.Error.Error(),
	})
}
