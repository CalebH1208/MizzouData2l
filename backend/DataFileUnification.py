import pandas as pd
import numpy as np
from pathlib import Path
import sys
import os

def find_required_files(folder_path):
    """Find the 3 required CSV files in the folder"""
    folder_path = Path(folder_path)
    
    if not folder_path.exists():
        raise FileNotFoundError(f"Folder does not exist: {folder_path}")
    
    required_files = {
        "1HZLOG.CSV": None,
        "10HZLOG.CSV": None,
        "100HZLOG.CSV": None
    }
    
    # Search for files (case-insensitive)
    for file_path in folder_path.glob("*.csv"):
        file_name = file_path.name.upper()
        for required_file in required_files.keys():
            if file_name == required_file:
                required_files[required_file] = file_path
                break
    
    # Also try .CSV extension
    for file_path in folder_path.glob("*.CSV"):
        file_name = file_path.name.upper()
        for required_file in required_files.keys():
            if file_name == required_file:
                required_files[required_file] = file_path
                break
    
    # Check if all files were found
    missing_files = [name for name, path in required_files.items() if path is None]
    if missing_files:
        raise FileNotFoundError(f"Missing required files: {', '.join(missing_files)}")
    
    return (
        required_files["100HZLOG.CSV"],
        required_files["10HZLOG.CSV"], 
        required_files["1HZLOG.CSV"]
    )

def detect_header_format(file_path):
    """Detect if the file has extended headers (4 lines) or simple headers (1 line)"""
    with open(file_path, 'r') as file:
        lines = file.readlines()
    
    if len(lines) < 4:
        return False, lines[0].strip()
    
    header_line = lines[0].strip()
    
    # Simple heuristic: try to parse second line as data
    try:
        parts = lines[1].split(',')
        int(parts[0].strip())  # Should be a timestamp
        return False, header_line
    except (ValueError, IndexError):
        return True, header_line

def clean_csv_data(file_path):
    """Clean CSV data by removing header repetitions and handling time restarts"""
    has_extended_headers, header_line = detect_header_format(file_path)
    header_lines_count = 4 if has_extended_headers else 1
    
    with open(file_path, 'r') as file:
        lines = file.readlines()
    
    # Get expected column count from header
    expected_columns = len(header_line.split(','))
    
    # Create a standardized 4-line header
    if has_extended_headers:
        # Use existing extended header
        complete_header = ''.join(lines[:4])
    else:
        # Create 4-line header from single line
        column_names = header_line.split(',')
        units_line = ','.join(['unknown'] * len(column_names))
        conversion_line = ','.join(['-7'] * len(column_names))
        precision_line = ','.join(['32'] * len(column_names))
        
        complete_header = f"{header_line}\n{units_line}\n{conversion_line}\n{precision_line}\n"
    
    # Filter out header repetitions and collect data
    data_lines = []
    last_time = 0
    time_offset = 0
    
    i = header_lines_count  # Start after the initial header
    while i < len(lines):
        line = lines[i].strip()
        
        # Check if this is a header repetition
        if line == header_line:
            i += header_lines_count
            continue
        
        # Process data line
        if line:
            parts = line.split(',')
            
            # Fix malformed lines with extra data points
            if len(parts) > expected_columns:
                parts = parts[:expected_columns]  # Truncate to expected length
            
            if len(parts) >= 2:
                try:
                    current_time = int(parts[0])
                    
                    # Apply current time offset to get the adjusted time
                    adjusted_time = current_time + time_offset
                    
                    # Check if time has restarted
                    if adjusted_time < last_time:
                        time_offset = last_time
                        adjusted_time = current_time + time_offset
                    
                    # Update the parts with the adjusted time
                    parts[0] = str(adjusted_time)
                    
                    # Ensure we have the right number of columns
                    if len(parts) == expected_columns:
                        data_lines.append(','.join(parts))
                        last_time = adjusted_time
                except ValueError:
                    pass  # Skip malformed lines
        
        i += 1
    
    # Write cleaned data to temporary file
    cleaned_file = file_path.with_suffix('.cleaned.csv')
    with open(cleaned_file, 'w') as file:
        # Always write the complete 4-line header
        file.write(complete_header)
        file.write('\n'.join(data_lines))
    
    return cleaned_file

def interpolate_data(source_df, target_times, time_col='Time'):
    """Interpolate data from source DataFrame to target times"""
    # Find the actual time column name
    actual_time_col = None
    for col in source_df.columns:
        if col.strip().lower() == time_col.lower():
            actual_time_col = col
            break
    
    if actual_time_col is None:
        raise ValueError(f"Time column '{time_col}' not found in source data")
    
    # Create result DataFrame with target times
    result_df = pd.DataFrame({time_col: target_times})
    
    # Interpolate each column except Time and GLOBAL time
    for col in source_df.columns:
        if col != actual_time_col and 'global' not in col.lower():
            result_df[col] = np.interp(target_times, source_df[actual_time_col], source_df[col])
    
    return result_df

def combine_data_files(hz_100_file, hz_10_file, hz_1_file, output_file):
    """Combine three CSV files with different sampling rates into one file"""
    # Convert to Path objects
    hz_100_file = Path(hz_100_file)
    hz_10_file = Path(hz_10_file)
    hz_1_file = Path(hz_1_file)
    
    # Clean the data files
    cleaned_100 = clean_csv_data(hz_100_file)
    cleaned_10 = clean_csv_data(hz_10_file)
    cleaned_1 = clean_csv_data(hz_1_file)
    
    try:
        # Read the header information from the cleaned files
        def read_header_info(file_path):
            with open(file_path, 'r') as f:
                lines = f.readlines()
                return {
                    'columns': lines[0].strip().split(','),
                    'units': lines[1].strip().split(','),
                    'conversion': lines[2].strip().split(','),
                    'precision': lines[3].strip().split(',')
                }
        
        header_100 = read_header_info(cleaned_100)
        header_10 = read_header_info(cleaned_10)
        header_1 = read_header_info(cleaned_1)
        
        # Read cleaned data - always skip the first 3 lines (units, conversion, precision)
        # since we now always generate 4-line headers
        df_100 = pd.read_csv(cleaned_100, skiprows=[1, 2, 3])
        df_10 = pd.read_csv(cleaned_10, skiprows=[1, 2, 3])
        df_1 = pd.read_csv(cleaned_1, skiprows=[1, 2, 3])
        
        # Remove GLOBAL time columns
        for df in [df_100, df_10, df_1]:
            global_time_cols = [col for col in df.columns if 'global' in col.lower()]
            for col in global_time_cols:
                df.drop(col, axis=1, inplace=True)
        
        # Find time column
        time_col = None
        for col in df_100.columns:
            if col.strip().lower() == 'time':
                time_col = col
                break
        
        if time_col is None:
            raise ValueError("Time column not found in 100Hz data")
        
        target_times = df_100[time_col].values
        
        # Interpolate data
        df_10_interp = interpolate_data(df_10, target_times, time_col)
        df_1_interp = interpolate_data(df_1, target_times, time_col)
        
        # Combine all data
        combined_df = df_100.copy()
        
        # Add columns from other files
        for col in df_10_interp.columns:
            if col.strip().lower() != 'time':
                combined_df[col] = df_10_interp[col]
        
        for col in df_1_interp.columns:
            if col.strip().lower() != 'time':
                combined_df[col] = df_1_interp[col]
        
        # Create the complete 4-line header for the output file
        # Use existing header information where available
        final_columns = list(combined_df.columns)
        final_units = []
        final_conversion = []
        final_precision = []
        
        for col in final_columns:
            # Check if this column exists in any of the source headers
            col_found = False
            
            # Check 100Hz file first
            if col in header_100['columns']:
                idx = header_100['columns'].index(col)
                final_units.append(header_100['units'][idx])
                final_conversion.append(header_100['conversion'][idx])
                final_precision.append(header_100['precision'][idx])
                col_found = True
            # Check 10Hz file
            elif col in header_10['columns']:
                idx = header_10['columns'].index(col)
                final_units.append(header_10['units'][idx])
                final_conversion.append(header_10['conversion'][idx])
                final_precision.append(header_10['precision'][idx])
                col_found = True
            # Check 1Hz file
            elif col in header_1['columns']:
                idx = header_1['columns'].index(col)
                final_units.append(header_1['units'][idx])
                final_conversion.append(header_1['conversion'][idx])
                final_precision.append(header_1['precision'][idx])
                col_found = True
            
            # If not found in any source, use defaults
            if not col_found:
                final_units.append('unknown')
                final_conversion.append('-7')
                final_precision.append('32')
        
        # Write to output file with complete 4-line header
        with open(output_file, 'w', newline='') as f:
            f.write(','.join(final_columns) + '\n')
            f.write(','.join(final_units) + '\n')
            f.write(','.join(final_conversion) + '\n')
            f.write(','.join(final_precision) + '\n')
            
            # Write the data without extra newlines
            combined_df.to_csv(f, index=False, header=False, lineterminator='\n')
        
    finally:
        # Clean up temporary files
        for temp_file in [cleaned_100, cleaned_10, cleaned_1]:
            if temp_file.exists():
                temp_file.unlink()

def process_directory(directory_path):
    """Main function to process a directory and create fullData.csv"""
    try:
        # Find required files
        hz_100_file, hz_10_file, hz_1_file = find_required_files(directory_path)
        
        # Set output file path
        output_file = Path(directory_path) / "fullData.csv"
        
        # Combine the files
        combine_data_files(hz_100_file, hz_10_file, hz_1_file, output_file)
        
        return 0  # Success
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        return 1  # Error

def main():
    """Command line interface"""
    if len(sys.argv) != 2:
        print("Usage: python DataFileUnification.py <directory_path>", file=sys.stderr)
        return 1
    
    directory_path = sys.argv[1]
    return process_directory(directory_path)

if __name__ == "__main__":
    sys.exit(main())