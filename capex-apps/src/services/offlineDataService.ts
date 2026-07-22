
import { OfflineDataItem } from '../types';
import * as XLSX from 'xlsx';

export const parseExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheet];
                const json = XLSX.utils.sheet_to_json(worksheet);
                resolve(json);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsBinaryString(file);
    });
};

/** Legacy offline dataset storage removed — use backend data management. */
export const saveDataset = async (_datasetName: string, _rows: any[]): Promise<void> => {
    throw new Error('Offline dataset storage removed. Use backend data management.');
};

export const getDataset = async (_datasetName: string): Promise<OfflineDataItem[]> => [];

export const deleteDataset = async (_datasetName: string): Promise<void> => {
    throw new Error('Offline dataset storage removed.');
};

export const updateDatasetProcessed = async (
    _items: OfflineDataItem[],
    _processedRows: unknown[],
): Promise<void> => {
    throw new Error('Offline dataset storage removed. Use backend data management.');
};
