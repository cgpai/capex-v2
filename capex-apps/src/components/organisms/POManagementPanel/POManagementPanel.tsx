import React from 'react';
import { PurchaseOrder, Vendor, POStatus, MasterCatalogueItem } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { generatePOPdf } from '../../../utils/generatePOPdf';

interface POManagementPanelProps {
    purchaseOrders: PurchaseOrder[];
    allVendors: Vendor[];
    onOpenCreateModal: () => void;
    onCancelPO: (poId: string) => void;
    onOpenGoodsReceivedModal: (po: PurchaseOrder) => void;
    canCreate: boolean;
    hospitalUnitName?: string;
    hospitalUnitCode?: string;
    projectName?: string;
    masterCatalogue?: MasterCatalogueItem[];
    showToast?: (message: string, type?: 'success' | 'error') => void;
}

const getStatusColor = (status: POStatus) => {
    switch(status) {
        case 'Active': return 'bg-green-100 text-green-800';
        case 'Canceled': return 'bg-red-100 text-red-800';
        case 'Partially Received': return 'bg-yellow-100 text-yellow-800';
        case 'Completed': return 'bg-blue-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

export const POManagementPanel: React.FC<POManagementPanelProps> = ({
    purchaseOrders,
    allVendors,
    onOpenCreateModal,
    onCancelPO,
    onOpenGoodsReceivedModal,
    canCreate,
    hospitalUnitName,
    hospitalUnitCode,
    projectName,
    masterCatalogue,
    showToast,
}) => {
    
    const handleViewPdf = (po: PurchaseOrder) => {
        try {
            const vendor = allVendors.find(v => v.id === po.vendorId);
            generatePOPdf(po, vendor, {
                hospitalUnitName,
                hospitalUnitCode,
                projectName,
                masterCatalogue,
                franco: hospitalUnitName,
            }, 'view');
        } catch (error) {
            console.error('Failed to generate PO PDF:', error);
            showToast?.('Gagal membuka dokumen PO.', 'error');
        }
    };
    
    const handleCancel = (po: PurchaseOrder) => {
        if (window.confirm(`Are you sure you want to cancel PO #${po.poNumber}? This will return its value to the budget.`)) {
            onCancelPO(po.id);
        }
    };
    
    return (
        <div className="bg-siloam-surface p-4 md:p-6 rounded-xl shadow-soft space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Purchase Orders</h2>
                {canCreate && (
                    <button onClick={onOpenCreateModal} className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft">
                        + Create New PO
                    </button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                        <tr>
                            <th className="px-4 py-2 text-left">PO Number</th>
                            <th className="px-4 py-2 text-left">Vendor</th>
                            <th className="px-4 py-2 text-right">Total Value</th>
                            <th className="px-4 py-2 text-center">Status</th>
                            <th className="px-4 py-2 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {purchaseOrders.map(po => (
                            <tr key={po.id} className="border-b border-siloam-border last:border-b-0">
                                <td className="px-4 py-3 font-mono">{po.poNumber}</td>
                                <td className="px-4 py-3">{po.vendorName}</td>
                                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(po.totalValue)}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(po.status)}`}>
                                        {po.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center space-x-2 whitespace-nowrap">
                                    <button type="button" onClick={() => handleViewPdf(po)} className="text-siloam-blue hover:underline">View PDF</button>
                                    {(po.status === 'Active' || po.status === 'Partially Received') && (
                                        <button onClick={() => onOpenGoodsReceivedModal(po)} className="text-siloam-green hover:underline">Mark Received</button>
                                    )}
                                    {po.status === 'Active' && (
                                        <button onClick={() => handleCancel(po)} className="text-danger hover:underline">Cancel</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                         {purchaseOrders.length === 0 && (
                            <tr><td colSpan={5} className="text-center p-8 text-siloam-text-secondary">No Purchase Orders created for this stage yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
POManagementPanel.displayName = 'POManagementPanel';