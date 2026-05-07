export default function TransactionsTable({ transactions }) {
  if (!transactions || transactions.length === 0) return null;

  const formatValue = (key, val) => {
    if (val === null || val === undefined) return '—';
    if (key === 'amount') {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return `+${val}`;
    }
    return val;
  };

  return (
    <div className="transactions-section">
      <div className="transactions-header">
        <h2>Transactions</h2>
        <p>
          <span className="positive">+ amounts</span> added to customer (you!) ·{' '}
          <span className="negative">− amounts</span> deducted from customer (you!)
        </p>
      </div>
      <div className="transactions-table-wrapper">
        <table className="transactions-table">
          <thead>
            <tr>
              {Object.keys(transactions[0]).map((key) => (
                <th key={key}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => (
              <tr key={i}>
                {Object.entries(tx).map(([key, val], j) => (
                  <td key={j}>{formatValue(key, val)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
