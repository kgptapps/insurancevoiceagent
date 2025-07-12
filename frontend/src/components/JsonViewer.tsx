import React, { useState } from 'react';
import './JsonViewer.css';

interface JsonViewerProps {
  data: any;
  title?: string;
  collapsed?: boolean;
  maxHeight?: string;
}

const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  title = "JSON Data",
  collapsed = false,
  maxHeight = "400px"
}) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  const formatValue = (value: any, key?: string): React.ReactElement => {
    if (value === null) {
      return <span className="json-null">null</span>;
    }
    
    if (typeof value === 'boolean') {
      return <span className="json-boolean">{value.toString()}</span>;
    }
    
    if (typeof value === 'number') {
      return <span className="json-number">{value}</span>;
    }
    
    if (typeof value === 'string') {
      // Special formatting for certain insurance fields
      if (key === 'email' && value.includes('@')) {
        return <span className="json-string json-email">"{value}"</span>;
      }
      if (key === 'zip_code' || key === 'zipCode') {
        return <span className="json-string json-zipcode">"{value}"</span>;
      }
      if (key === 'primary_phone' || key === 'phoneNumber') {
        return <span className="json-string json-phone">"{value}"</span>;
      }
      if (key === 'make' || key === 'model' || key === 'curatedModel') {
        return <span className="json-string json-vehicle">"{value}"</span>;
      }
      if (key === 'year' && typeof value === 'string' && /^\d{4}$/.test(value)) {
        return <span className="json-string json-year">"{value}"</span>;
      }
      return <span className="json-string">"{value}"</span>;
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="json-array">[]</span>;
      }
      
      return (
        <div className="json-array">
          <span className="json-bracket">[</span>
          <div className="json-array-content">
            {value.map((item, index) => (
              <div key={index} className="json-array-item">
                {formatValue(item)}
                {index < value.length - 1 && <span className="json-comma">,</span>}
              </div>
            ))}
          </div>
          <span className="json-bracket">]</span>
        </div>
      );
    }
    
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return <span className="json-object">{'{}'}</span>;
      }
      
      return (
        <div className="json-object">
          <span className="json-brace">{'{'}</span>
          <div className="json-object-content">
            {keys.map((objKey, index) => (
              <div key={objKey} className="json-property">
                <span className="json-key">"{objKey}"</span>
                <span className="json-colon">: </span>
                {formatValue(value[objKey], objKey)}
                {index < keys.length - 1 && <span className="json-comma">,</span>}
              </div>
            ))}
          </div>
          <span className="json-brace">{'}'}</span>
        </div>
      );
    }
    
    return <span>{String(value)}</span>;
  };

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="json-viewer">
        <div className="json-header">
          <h4>{title}</h4>
        </div>
        <div className="json-content">
          <p className="no-data">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="json-viewer">
      <div className="json-header">
        <div className="json-title">
          <button 
            className="collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
          <h4>{title}</h4>
          <span className="json-type">
            {Array.isArray(data) ? 'Array' : typeof data === 'object' ? 'Object' : typeof data}
          </span>
        </div>
        <div className="json-actions">
          <button 
            className={`copy-btn ${copied ? 'copied' : ''}`}
            onClick={copyToClipboard}
            title="Copy JSON to clipboard"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>
      
      {!isCollapsed && (
        <div className="json-content" style={{ maxHeight }}>
          <div className="json-formatted">
            {formatValue(data)}
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonViewer;
