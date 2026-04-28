import React, { useEffect } from 'react';
import { Backend } from '../../wailsjs/go/models';
import { useHelpKey } from '../contexts/HelpContext';
import XYScatterToolUI from './tools/XYScatterToolUI';
import DownforceToolUI from './tools/DownforceToolUI';
import ShiftAnalysisToolUI from './tools/ShiftAnalysisToolUI';
import GPSLapToolUI from './tools/GPSLapToolUI';
import DataExportToolUI from './tools/DataExportToolUI';
import PowertrainToolUI from './tools/PowertrainToolUI';
import RideFrequencyToolUI from './tools/RideFrequencyToolUI';
import BrakeAnalysisToolUI from './tools/BrakeAnalysisToolUI';

interface ToolExecutorProps {
  fragment: Backend.Data_fragment;
  tool: Backend.Tool_info;
  onBack: () => void;
}

const ToolExecutor: React.FC<ToolExecutorProps> = ({
  fragment,
  tool,
  onBack,
}) => {
  const { setHelpKey } = useHelpKey();

  useEffect(() => {
    setHelpKey(`tools/${tool.name}`);
    return () => setHelpKey(null);
  }, [tool.name]);

  const renderToolComponent = () => {
    switch (tool.name) {
      case 'xy-scatter':
        return <XYScatterToolUI fragment={fragment} />;
      case 'downforce-calculator':
        return <DownforceToolUI fragment={fragment} />;
      case 'shift-analysis':
        return <ShiftAnalysisToolUI fragment={fragment} />;
      case 'gps-lap-analysis':
        return <GPSLapToolUI fragment={fragment} />;
      case 'data-export':
        return <DataExportToolUI fragment={fragment} />;
      case 'powertrain-analysis':
        return <PowertrainToolUI fragment={fragment} />;
      case 'ride-frequency':
        return <RideFrequencyToolUI fragment={fragment} />;
      case 'brake-analysis':
        return <BrakeAnalysisToolUI fragment={fragment} />;
      default:
        return (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            color: '#aaa',
            fontSize: '14px',
          }}>
            Tool "{tool.name}" UI not implemented yet
          </div>
        );
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
    }}>
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {renderToolComponent()}
      </div>
    </div>
  );
};

export default ToolExecutor;
