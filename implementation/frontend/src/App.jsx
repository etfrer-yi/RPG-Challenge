import { useState } from 'react';
import './styles/upload.css';
import FileUpload from './components/FileUpload';
import TransactionsTable from './components/TransactionsTable';

export default function App() {
  const [transactions, setTransactions] = useState(null);

  const handleTransactions = (incoming) =>
    setTransactions((prev) => prev ? [...prev, ...incoming] : incoming);

  return (
    <main>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Document Upload</h1>
        <p style={{ color: '#8e8e93', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Upload financial documents for processing
        </p>
      </div>
      <FileUpload onTransactions={handleTransactions} />
      <TransactionsTable transactions={transactions} />
    </main>
  );
}
