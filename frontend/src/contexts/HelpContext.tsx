import React, { createContext, useContext, useState } from 'react';

interface HelpContextType {
  helpKey: string | null;
  setHelpKey: (key: string | null) => void;
}

const HelpContext = createContext<HelpContextType>({ helpKey: null, setHelpKey: () => {} });

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [helpKey, setHelpKey] = useState<string | null>(null);
  return (
    <HelpContext.Provider value={{ helpKey, setHelpKey }}>
      {children}
    </HelpContext.Provider>
  );
};

export const useHelpKey = () => useContext(HelpContext);
