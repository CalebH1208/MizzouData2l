import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useHelpKey } from '../contexts/HelpContext';

import welcomeDoc from '@docs/WelcomeScreen.md';
import dataEntryDoc from '@docs/DataEntryPage.md';
import graphsDoc from '@docs/GraphsPage.md';
import toolsDoc from '@docs/ToolsPage.md';
import fileManagerDoc from '@docs/FileManager.md';
import xyScatterDoc from '@docs/tools/XYScatter.md';
import downforceDoc from '@docs/tools/Downforce.md';
import shiftDoc from '@docs/tools/ShiftAnalysis.md';
import gpsDoc from '@docs/tools/GPSLap.md';
import exportDoc from '@docs/tools/DataExport.md';
import kpiSearchDoc from '@docs/KPISearchPage.md';

type HelpDoc = { html: string; meta: { title: string; x: number; y: number; corner: 'bl' | 'br' | 'tl' | 'tr' } };

const helpRegistry: Record<string, HelpDoc> = {
  '/':                          welcomeDoc,
  '/data-entry':                dataEntryDoc,
  '/graphs':                    graphsDoc,
  '/tools':                     toolsDoc,
  'file-manager':               fileManagerDoc,
  'tools/xy-scatter':           xyScatterDoc,
  'tools/downforce-calculator': downforceDoc,
  'tools/shift-analysis':       shiftDoc,
  'tools/gps-lap-analysis':     gpsDoc,
  'tools/data-export':          exportDoc,
  '/kpi-search':                kpiSearchDoc,
};

const HELP_STYLES = `
  #help-content h1 { color: #F1B82D; font-size: 22px; border-bottom: 1px solid #333; padding-bottom: 8px; margin-top: 0; }
  #help-content h2 { color: #F1B82D; font-size: 18px; margin-top: 24px; }
  #help-content h3 { color: #F1B82D; font-size: 16px; }
  #help-content p { color: #ccc; line-height: 1.7; font-size: 14px; }
  #help-content strong { color: white; }
  #help-content code { background: #333; color: #F1B82D; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  #help-content pre { background: #111; padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid #333; }
  #help-content pre code { background: none; padding: 0; }
  #help-content ul, #help-content ol { color: #ccc; padding-left: 24px; line-height: 1.7; }
  #help-content li { margin-bottom: 4px; }
  #help-content a { color: #F1B82D; text-decoration: underline; }
  #help-content hr { border: none; border-top: 1px solid #333; margin: 20px 0; }
  #help-content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  #help-content th { background: #222; color: #F1B82D; border: 1px solid #444; padding: 8px 12px; text-align: left; }
  #help-content td { border: 1px solid #444; padding: 8px 12px; color: #ccc; }
  #help-content blockquote { border-left: 3px solid #F1B82D; margin: 12px 0; padding: 8px 16px; color: #aaa; background: #111; border-radius: 0 8px 8px 0; }
`;

const HelpOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const location = useLocation();
  const { helpKey } = useHelpKey();

  useEffect(() => {
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resolvedKey = helpKey ?? location.pathname;
  const doc = helpRegistry[resolvedKey];
  const title = doc?.meta.title || 'Help';
  const html = doc?.html || '<p style="color:#aaa">This page needs documentation.</p>';
  const corner = doc?.meta.corner ?? 'bl';
  const ox = doc?.meta.x ?? 20;
  const oy = doc?.meta.y ?? 20;
  const btnSize = 36;
  const computedTop  = corner.includes('t') ? oy : windowSize.h - oy - btnSize;
  const computedLeft = corner.includes('l') ? ox : windowSize.w - ox - btnSize;
  const btnPos: React.CSSProperties = {
    top:  computedTop,
    left: computedLeft,
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        title="Help (F1)"
        style={{
          position: 'fixed',
          ...btnPos,
          width: 36,
          height: 36,
          borderRadius: '50%',
          backgroundColor: btnHovered ? '#F1B82D' : '#1a1a1a',
          border: '2px solid #F1B82D',
          color: btnHovered ? '#0a0a0a' : '#F1B82D',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'top 0.35s ease, left 0.35s ease, background-color 0.2s ease, color 0.2s ease',
          fontFamily: 'inherit',
        }}
      >
        ?
      </button>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#1a1a1a',
              border: '2px solid #F1B82D',
              borderRadius: '12px',
              padding: '30px',
              maxWidth: '700px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 10px 50px rgba(241, 184, 45, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#F1B82D', margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                {title}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#aaa',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '0 4px',
                  lineHeight: 1,
                  fontFamily: 'inherit',
                }}
              >
                ✕
              </button>
            </div>

            <div id="help-content">
              <style>{HELP_STYLES}</style>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HelpOverlay;
