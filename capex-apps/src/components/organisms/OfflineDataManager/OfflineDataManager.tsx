import React, { useState, useRef, useEffect } from 'react';
import * as offlineDataService from '../../../services/offlineDataService';
import * as aiService from '../../../services/aiService';
import { OfflineDataItem } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { GenericTable, Column } from '../GenericTable/GenericTable';

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
);

const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
);

export const OfflineDataManager: React.FC = () => {
    const { showToast } = useToast();
    const [datasetName, setDatasetName] = useState('');
    const [data, setData] = useState<OfflineDataItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const name = file.name.split('.')[0];
        setDatasetName(name);
        setLoading(true);

        try {
            const json = await offlineDataService.parseExcelFile(file);
            await offlineDataService.saveDataset(name, json);
            const savedData = await offlineDataService.getDataset(name);
            setData(savedData);
        } catch (error) {
            console.error(error);
            showToast('Gagal mem-parse file Excel.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAIProcess = async () => {
        if (data.length === 0) return;
        setIsAiProcessing(true);
        try {
            const rawRows = data.map(d => d.originalRow);
            const processedRows = await aiService.smartProcessData(rawRows);
            await offlineDataService.updateDatasetProcessed(data, processedRows);
            
            // Refresh data
            const updatedData = await offlineDataService.getDataset(datasetName);
            setData(updatedData);
            showToast('Proses AI selesai.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Proses AI gagal.', 'error');
        } finally {
            setIsAiProcessing(false);
        }
    };

    const columns: Column<OfflineDataItem>[] = [
        { 
            header: 'Original Data (Raw)', 
            accessor: (item) => (
                <div className="text-xs text-siloam-text-secondary max-h-20 overflow-y-auto whitespace-pre-wrap">
                    {JSON.stringify(item.originalRow, null, 2)}
                </div>
            )
        },
        {
            header: 'AI Processed Data',
            accessor: (item) => (
                item.status === 'Processed' && item.processedRow ? (
                    <div className="text-xs text-siloam-blue font-mono max-h-20 overflow-y-auto whitespace-pre-wrap bg-blue-50 p-1 rounded">
                        {JSON.stringify(item.processedRow, null, 2)}
                    </div>
                ) : (
                    <span className="text-gray-400 italic text-xs">Not processed</span>
                )
            )
        },
        { 
            header: 'Status', 
            accessor: (item) => (
                <span className={`px-2 py-1 rounded text-xs font-bold ${item.status === 'Processed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {item.status}
                </span>
            )
        }
    ];

    return (
        <div className="bg-siloam-surface rounded-xl shadow-soft p-6 space-y-6">
            <div className="flex justify-between items-start border-b border-siloam-border pb-4">
                <div>
                    <h2 className="text-xl font-bold text-siloam-text-primary">Offline Excel Manager</h2>
                    <p className="text-sm text-siloam-text-secondary">Upload raw Excel files, clean them with AI, and store offline.</p>
                </div>
                <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls" />
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="flex items-center gap-2 bg-siloam-sidebar text-siloam-text-primary px-4 py-2 rounded-lg hover:bg-siloam-border transition"
                        disabled={loading || isAiProcessing}
                    >
                        <UploadIcon /> Upload Excel
                    </button>
                    {data.length > 0 && (
                        <button 
                            onClick={handleAIProcess} 
                            disabled={isAiProcessing}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition disabled:opacity-50"
                        >
                            {isAiProcessing ? (
                                <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div> Processing...</>
                            ) : (
                                <><SparklesIcon /> ✨ AI Auto-Format</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-siloam-text-secondary">Processing file...</div>
            ) : data.length > 0 ? (
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm text-siloam-text-secondary px-2">
                        <span>Dataset: <strong>{datasetName}</strong></span>
                        <span>{data.length} Rows</span>
                    </div>
                    <div className="border border-siloam-border rounded-lg overflow-hidden">
                        <GenericTable columns={columns} data={data} className="max-h-[500px]" />
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 bg-siloam-bg rounded-xl border border-dashed border-siloam-border">
                    <p className="text-siloam-text-secondary">No dataset loaded. Upload an Excel file to begin.</p>
                </div>
            )}
        </div>
    );
};
