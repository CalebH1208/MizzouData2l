import React from 'react';
import { SearchGroup, SearchCondition } from './types';

interface Props {
  groups: SearchGroup[];
  onChange: (groups: SearchGroup[]) => void;
  availableChannels: string[];
  paddingSec: number;
  onPaddingChange: (v: number) => void;
  resultName: string;
  onResultNameChange: (v: string) => void;
}

const OPERATORS = ['>', '<', '>=', '<=', '==', '!='];

const ConditionBuilder: React.FC<Props> = ({
  groups, onChange, availableChannels,
  paddingSec, onPaddingChange, resultName, onResultNameChange,
}) => {

  const updateGroup = (gi: number, update: Partial<SearchGroup>) => {
    const newGroups = groups.map((g, i) => i === gi ? { ...g, ...update } : g);
    onChange(newGroups);
  };

  const addGroup = () => {
    onChange([...groups, {
      conditions: [{ channel: availableChannels[0] || '', operator: '>', value: 0 }],
      minDurationSec: 0,
    }]);
  };

  const removeGroup = (gi: number) => {
    onChange(groups.filter((_, i) => i !== gi));
  };

  const updateCondition = (gi: number, ci: number, update: Partial<SearchCondition>) => {
    const newConds = groups[gi].conditions.map((c, i) => i === ci ? { ...c, ...update } : c);
    updateGroup(gi, { conditions: newConds });
  };

  const addCondition = (gi: number) => {
    const newConds = [...groups[gi].conditions, { channel: availableChannels[0] || '', operator: '>', value: 0 }];
    updateGroup(gi, { conditions: newConds });
  };

  const removeCondition = (gi: number, ci: number) => {
    const newConds = groups[gi].conditions.filter((_, i) => i !== ci);
    if (newConds.length === 0) {
      removeGroup(gi);
    } else {
      updateGroup(gi, { conditions: newConds });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
      <div style={{ fontSize: 13, color: '#F1B82D', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
        Conditions
      </div>

      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div style={{
              textAlign: 'center', color: '#F1B82D', fontSize: 12,
              fontWeight: 'bold', padding: '4px 0', letterSpacing: 2,
            }}>
              — OR —
            </div>
          )}
          <div style={{
            background: '#252530',
            border: '1px solid #444',
            borderRadius: 6,
            padding: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#aaa', fontWeight: 'bold' }}>
                Group {gi + 1} (AND)
              </span>
              {groups.length > 1 && (
                <button onClick={() => removeGroup(gi)} style={removeBtn}>✕</button>
              )}
            </div>

            {group.conditions.map((cond, ci) => (
              <div key={ci} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select
                  value={cond.channel}
                  onChange={e => updateCondition(gi, ci, { channel: e.target.value })}
                  style={{ ...inputStyle, flex: 2 }}
                >
                  <option value="">Select channel...</option>
                  {availableChannels.filter(c => c !== 'Time').map(ch => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>

                <select
                  value={cond.operator}
                  onChange={e => updateCondition(gi, ci, { operator: e.target.value })}
                  style={{ ...inputStyle, flex: 0, minWidth: 55 }}
                >
                  {OPERATORS.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>

                <input
                  type="number"
                  value={cond.value}
                  onChange={e => updateCondition(gi, ci, { value: parseFloat(e.target.value) || 0 })}
                  style={{ ...inputStyle, flex: 1 }}
                />

                {group.conditions.length > 1 && (
                  <button onClick={() => removeCondition(gi, ci)} style={removeBtn}>✕</button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <button onClick={() => addCondition(gi)} style={addBtn}>+ Condition</button>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <label style={{ fontSize: 11, color: '#888' }}>Min duration (s):</label>
                <input
                  type="number"
                  value={group.minDurationSec || ''}
                  onChange={e => updateGroup(gi, { minDurationSec: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  style={{ ...inputStyle, width: 60 }}
                  step="0.1"
                />
              </div>
            </div>
          </div>
        </div>
      ))}

      <button onClick={addGroup} style={{
        ...addBtn,
        alignSelf: 'flex-start',
        background: '#333',
        borderColor: '#F1B82D',
        color: '#F1B82D',
      }}>
        + OR Group
      </button>

      <div style={{ borderTop: '1px solid #333', paddingTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#aaa' }}>Padding (s):</label>
          <input
            type="number"
            value={paddingSec}
            onChange={e => onPaddingChange(parseFloat(e.target.value) || 0)}
            style={{ ...inputStyle, width: 70 }}
            step="0.5"
            min="0"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#aaa' }}>Result name:</label>
          <input
            type="text"
            value={resultName}
            onChange={e => onResultNameChange(e.target.value)}
            placeholder="KPI_Result"
            style={{ ...inputStyle, width: 160 }}
          />
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  background: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#eee',
  padding: '5px 8px',
  fontSize: 13,
};

const addBtn: React.CSSProperties = {
  background: '#2a2a2a',
  border: '1px solid #556',
  borderRadius: 4,
  color: '#aaa',
  padding: '4px 10px',
  fontSize: 11,
  cursor: 'pointer',
};

const removeBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#ff6b6b',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 6px',
};

export default ConditionBuilder;
