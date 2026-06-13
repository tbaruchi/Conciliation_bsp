import { useState } from 'react';
import logo from './assets/pkf-logo.png';
import BankReconciliation from './components/BankReconciliation';
import ComingSoon from './components/ComingSoon';

const TABS = [
  { id: 'banco', label: 'Banco' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'fornecedores', label: 'Fornecedores' },
  { id: 'impostos', label: 'Impostos' },
];

function App() {
  const [activeTab, setActiveTab] = useState('banco');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={logo} alt="PKF Brazil" className="h-10" />
          <h1 className="text-pkf-navy text-xl font-semibold hidden sm:block">
            Automação de Conciliações
          </h1>
        </div>
        <div className="h-1.5 w-full flex">
          <div className="flex-1 bg-pkf-magenta" />
          <div className="flex-1 bg-pkf-red" />
          <div className="flex-1 bg-pkf-orange" />
          <div className="flex-1 bg-pkf-lime" />
          <div className="flex-1 bg-pkf-green" />
          <div className="flex-1 bg-pkf-cyan" />
          <div className="flex-1 bg-pkf-navy" />
        </div>
      </header>

      <nav className="max-w-6xl mx-auto w-full px-6 mt-6">
        <div className="flex flex-wrap gap-2 border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-pkf-navy border border-gray-200 border-b-white -mb-px'
                  : 'text-gray-500 hover:text-pkf-navy hover:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        {activeTab === 'banco' && <BankReconciliation />}
        {activeTab === 'clientes' && <ComingSoon title="Conciliação de Clientes" />}
        {activeTab === 'fornecedores' && <ComingSoon title="Conciliação de Fornecedores" />}
        {activeTab === 'impostos' && <ComingSoon title="Conciliação de Impostos" />}
      </main>

      <footer className="text-center text-xs text-gray-400 py-4">
        PKF Brazil &middot; Automação de Conciliações
      </footer>
    </div>
  );
}

export default App;
