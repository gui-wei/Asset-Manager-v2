import React, { useState, useEffect, useRef } from 'react';

interface SmartInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder?: string;
}

const SmartInput: React.FC<SmartInputProps> = ({ label, value, onChange, suggestions, placeholder }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter(s => 
    s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="mb-4 relative" ref={wrapperRef}>
      <label className="block text-gray-700 text-sm font-bold mb-1">{label}</label>
      <input
        type="text"
        className="shadow-sm appearance-none border rounded w-full py-3 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-wechat-green"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
      />
      
      {showSuggestions && value && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-md shadow-lg max-h-40 overflow-y-auto">
          {filteredSuggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-600"
              onClick={() => {
                onChange(suggestion);
                setShowSuggestions(false);
              }}
            >
              <span className="text-wechat-green mr-2">⟲</span>
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartInput;