import './upload.css';
import FileUpload from './components/FileUpload';

export default function App() {
  return (
    <main>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Document Upload</h1>
        <p style={{ color: '#8e8e93', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Upload financial documents for processing
        </p>
      </div>
      <FileUpload />
    </main>
  );
}
