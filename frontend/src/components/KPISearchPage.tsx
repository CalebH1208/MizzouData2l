import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import { ExecuteSearch, CancelSearch, LoadSearchResult } from '../../wailsjs/go/Backend/KPI_search';
import TagFilterPanel from './kpisearch/TagFilterPanel';
import ConditionBuilder from './kpisearch/ConditionBuilder';
import SearchResults from './kpisearch/SearchResults';
import { SearchGroup, SearchResult, SearchProgress } from './kpisearch/types';
import { FileTagInfo } from './filemanager/types';
import AlertModal from './AlertModal';

const KPISearchPage: React.FC = () => {
  const navigate = useNavigate();

  const [tagFilters, setTagFilters] = useState<Record<string, string>>({});
  const [filteredFiles, setFilteredFiles] = useState<FileTagInfo[]>([]);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);

  const [groups, setGroups] = useState<SearchGroup[]>([
    { conditions: [{ channel: '', operator: '>', value: 0 }], minDurationSec: 0 }
  ]);
  const [paddingSec, setPaddingSec] = useState(1.0);
  const [resultName, setResultName] = useState('KPI_Result');

  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  // Compute union of channel names from filtered files
  useEffect(() => {
    const channelSet = new Set<string>();
    filteredFiles.forEach(fi => {
      (fi.channelNames || []).forEach(ch => channelSet.add(ch));
    });
    setAvailableChannels(Array.from(channelSet).sort());
  }, [filteredFiles]);

  // Listen for progress events
  useEffect(() => {
    const onProgress = (data: SearchProgress) => setProgress(data);
    const onComplete = (data: SearchResult) => {
      setResult(data);
      setSearching(false);
      setProgress(null);
    };

    EventsOn('kpi:progress', onProgress);
    EventsOn('kpi:complete', onComplete);

    return () => {
      EventsOff('kpi:progress');
      EventsOff('kpi:complete');
    };
  }, []);

  const handleSearch = async () => {
    // Validate
    const hasValidCondition = groups.some(g =>
      g.conditions.some(c => c.channel !== '')
    );
    if (!hasValidCondition) {
      setAlertModal({ isOpen: true, title: 'Missing Conditions', message: 'Add at least one condition with a selected channel.' });
      return;
    }
    if (filteredFiles.length === 0) {
      setAlertModal({ isOpen: true, title: 'No Files', message: 'No files match the current tag filters.' });
      return;
    }

    setSearching(true);
    setResult(null);
    setProgress({ phase: 'starting', fileIndex: 0, fileCount: 0, fileName: '', percent: 0 });

    try {
      const searchResult = await ExecuteSearch({
        groups,
        tagFilters,
        paddingSec,
        resultName: resultName || 'KPI_Result',
      } as any);
      setResult(searchResult);
    } catch (e: any) {
      if (!String(e).includes('cancelled')) {
        setAlertModal({ isOpen: true, title: 'Search Error', message: String(e) });
      }
    } finally {
      setSearching(false);
      setProgress(null);
    }
  };

  const handleCancel = () => {
    CancelSearch().catch(() => {});
  };

  const handleOpenResult = async () => {
    if (!result?.resultPath) return;
    try {
      await LoadSearchResult(result.resultPath);
      navigate('/graphs');
    } catch (e: any) {
      setAlertModal({ isOpen: true, title: 'Error', message: 'Failed to load result: ' + String(e) });
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      backgroundColor: 'black',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px',
        borderBottom: '2px solid #F1B82D',
        backgroundColor: '#1a1a1a',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            backgroundColor: '#F1B82D',
            color: 'black',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#d19f25'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F1B82D'}
        >
          ← Back
        </button>

        <h1 style={{
          margin: 0,
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#F1B82D',
        }}>
          KPI Search
        </h1>

        <div style={{ width: '120px' }}></div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel — Tag Filters */}
        <div style={{
          width: 250,
          borderRight: '2px solid #F1B82D',
          overflowY: 'auto',
          flexShrink: 0,
          backgroundColor: '#1a1a1a',
        }}>
          <TagFilterPanel
            tagFilters={tagFilters}
            onTagFiltersChange={setTagFilters}
            onFilteredFilesChange={setFilteredFiles}
          />
        </div>

        {/* Center Panel — Condition Builder + Search */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'black' }}>
            <ConditionBuilder
              groups={groups}
              onChange={setGroups}
              availableChannels={availableChannels}
              paddingSec={paddingSec}
              onPaddingChange={setPaddingSec}
              resultName={resultName}
              onResultNameChange={setResultName}
            />

            {/* Search Button */}
            <div style={{ padding: '0 12px 12px' }}>
              <button
                onClick={handleSearch}
                disabled={searching}
                style={{
                  width: '100%',
                  padding: '10px 20px',
                  backgroundColor: searching ? '#333333' : '#000000',
                  border: '2px solid #F1B82D',
                  borderRadius: '6px',
                  color: '#F1B82D',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: searching ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => { if (!searching) { e.currentTarget.style.backgroundColor = '#F1B82D'; e.currentTarget.style.color = '#000'; }}}
                onMouseLeave={e => { if (!searching) { e.currentTarget.style.backgroundColor = '#000000'; e.currentTarget.style.color = '#F1B82D'; }}}
              >
                {searching ? 'Searching...' : `Search ${filteredFiles.length} Files`}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          <div style={{
            borderTop: '2px solid #F1B82D',
            padding: 12,
            maxHeight: '40%',
            overflowY: 'auto',
            backgroundColor: '#1a1a1a',
          }}>
            <SearchResults
              result={result}
              progress={progress}
              searching={searching}
              onCancel={handleCancel}
              onOpenResult={handleOpenResult}
            />
          </div>
        </div>
      </div>

      <AlertModal {...alertModal} onClose={() => setAlertModal(p => ({ ...p, isOpen: false }))} />
    </div>
  );
};

export default KPISearchPage;
