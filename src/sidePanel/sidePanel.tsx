import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

const SidePanel = () => {
  const [count, setCount] = React.useState(0);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Hi, Side Panel!</h1>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<SidePanel />);