import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { t } from '@/utils/i18n';

const SidePanel: React.FC = () => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{t('sidepanel_title')}</h1>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<SidePanel />);