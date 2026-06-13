export default function FileUploadField({ label, hint, accept, file, onChange }) {
  const inputId = `file-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-pkf-navy mb-2">
        {label}
      </label>
      <label
        htmlFor={inputId}
        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-4 py-8 cursor-pointer hover:border-pkf-cyan hover:bg-pkf-cyan/5 transition-colors text-center"
      >
        <span className="text-3xl">📄</span>
        {file ? (
          <span className="text-sm font-medium text-pkf-navy break-all">{file.name}</span>
        ) : (
          <>
            <span className="text-sm text-gray-600">Clique para selecionar o arquivo</span>
            <span className="text-xs text-gray-400">{hint}</span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </label>
    </div>
  );
}
