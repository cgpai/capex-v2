
import React, { useState, useMemo, memo } from 'react';
import { formatCurrency } from '../../../lib/formatter';

interface SankeyLink {
    source: string;
    target: string;
    value: number;
}

interface SankeyNode {
    name: string;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    color: string;
    value: number;
    sourceLinks: SankeyLinkLayout[];
    targetLinks: SankeyLinkLayout[];
}

interface SankeyLinkLayout {
    source: SankeyNode;
    target: SankeyNode;
    value: number;
    y0: number; // y-position on source node
    y1: number; // y-position on target node
    width: number;
}

interface Props {
    title: string;
    data: SankeyLink[];
    width?: number;
    height?: number;
}

const ChartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const TableIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const CardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
);

const ArrowRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
);


const multiLevelSankeyLayout = (data: SankeyLink[], width: number, height: number) => {
    // 1. Initialize Nodes & Links
    const nodesByName: { [key: string]: SankeyNode } = {};
    const colors = ['#007BFF', '#28A745', '#FFC107', '#DC3545', '#6f42c1', '#fd7e14', '#20c997', '#6c757d', '#17a2b8', '#343a40'];
    const colorMap = new Map<string, string>();
    let colorIndex = 0;

    const getNodeColor = (name: string) => {
        if (!colorMap.has(name)) {
            colorMap.set(name, colors[colorIndex % colors.length]);
            colorIndex++;
        }
        return colorMap.get(name)!;
    }

    data.forEach(link => {
        if (!nodesByName[link.source]) {
            nodesByName[link.source] = { name: link.source, sourceLinks: [], targetLinks: [] } as unknown as SankeyNode;
        }
        if (!nodesByName[link.target]) {
            nodesByName[link.target] = { name: link.target, sourceLinks: [], targetLinks: [] } as unknown as SankeyNode;
        }
    });

    const linksLayout: SankeyLinkLayout[] = data.map(d => ({
        source: nodesByName[d.source],
        target: nodesByName[d.target],
        value: d.value,
    } as SankeyLinkLayout));

    linksLayout.forEach(link => {
        nodesByName[link.source.name].sourceLinks.push(link);
        nodesByName[link.target.name].targetLinks.push(link);
    });

    const nodesList = Object.values(nodesByName);

    // 2. Assign depths (columns)
    const columns: SankeyNode[][] = [];
    let remainingNodes = [...nodesList];
    while (remainingNodes.length > 0 && columns.length < 10) {
        const currentColumn = remainingNodes.filter(n =>
            n.targetLinks.every(l => !remainingNodes.includes(l.source))
        );
        if (currentColumn.length === 0) break; // Avoid infinite loop on circular deps

        columns.push(currentColumn);
        remainingNodes = remainingNodes.filter(n => !currentColumn.includes(n));
    }
    
    // 3. Calculate Node Values and Positions
    const nodeWidth = 24;
    const nodePadding = 12;
    const colXStep = (width - nodeWidth) / Math.max(1, columns.length - 1);

    columns.forEach((col, i) => {
        col.forEach(node => {
            node.x0 = i * colXStep;
            node.x1 = node.x0 + nodeWidth;
            node.value = Math.max(
                node.sourceLinks.reduce((sum, l) => sum + l.value, 0),
                node.targetLinks.reduce((sum, l) => sum + l.value, 0)
            );
            node.color = getNodeColor(node.name);
        });

        col.sort((a, b) => a.name.localeCompare(b.name));
        const totalValue = col.reduce((sum, n) => sum + n.value, 0);
        const totalPadding = (col.length - 1) * nodePadding;
        const scale = totalValue > 0 ? (height - totalPadding) / totalValue : 0;
        
        let y = 0;
        col.forEach(node => {
            node.y0 = y;
            node.y1 = y + node.value * scale;
            y = node.y1 + nodePadding;
        });
    });

    // 4. Position Links
    nodesList.forEach(node => {
        node.sourceLinks.sort((a, b) => a.target.y0 - b.target.y0);
        node.targetLinks.sort((a, b) => a.source.y0 - b.source.y0);
    });
    
    nodesList.forEach(node => {
        let ySource = node.y0;
        let yTarget = node.y0;

        node.sourceLinks.forEach(link => {
            link.width = (link.value / node.value) * (node.y1 - node.y0);
            link.y0 = ySource;
            ySource += link.width;
        });
        
        node.targetLinks.forEach(link => {
            const targetHeight = (link.value / node.value) * (node.y1 - node.y0);
            link.y1 = yTarget;
            yTarget += targetHeight;
        });
    });

    return { nodes: nodesList, links: linksLayout };
};

const sankeyLinkPath = (link: SankeyLinkLayout) => {
    const sourceHeight = link.width;
    const targetHeight = (link.value / link.target.value) * (link.target.y1 - link.target.y0);
    
    const x0 = link.source.x1;
    const x1 = link.target.x0;
    const y0_center = link.y0 + sourceHeight / 2;
    const y1_center = link.y1 + targetHeight / 2;

    const xi = (x0 + x1) / 2;
    return `M ${x0} ${y0_center} C ${xi} ${y0_center}, ${xi} ${y1_center}, ${x1} ${y1_center}`;
};


export const SankeyDiagram = memo(function SankeyDiagram({ title, data, width = 800, height = 550 }: Props) {
    const [viewMode, setViewMode] = useState<'chart' | 'table' | 'card'>('chart');
    const [hoveredName, setHoveredName] = useState<string | null>(null);

    const { nodes, links } = useMemo(() => {
        if (viewMode !== 'chart' || !data || data.length === 0) return { nodes: [], links: [] };
        return multiLevelSankeyLayout(data, width, height);
    }, [data, width, height, viewMode]);

    const hasData = data && data.length > 0;

    const renderChart = () => (
        <div className="relative flex-1 h-full min-h-[400px]">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
                <g>
                    {links.map((link, i) => (
                        <path
                            key={i}
                            d={sankeyLinkPath(link)}
                            stroke={link.source.color}
                            strokeOpacity={hoveredName ? (hoveredName === link.source.name || hoveredName === link.target.name ? 0.6 : 0.05) : 0.3}
                            strokeWidth={Math.max(1, link.width)}
                            fill="none"
                            className="transition-opacity duration-300"
                        >
                            <title>{`${link.source.name} → ${link.target.name}: ${formatCurrency(link.value)}`}</title>
                        </path>
                    ))}
                </g>
                <g>
                    {nodes.map(node => (
                        <g key={node.name} onMouseEnter={() => setHoveredName(node.name)} onMouseLeave={() => setHoveredName(null)}>
                            <rect 
                                x={node.x0} 
                                y={node.y0} 
                                width={node.x1 - node.x0} 
                                height={Math.max(1, node.y1 - node.y0)} 
                                fill={node.color}
                                rx="3"
                            />
                                <title>{`${node.name}: ${formatCurrency(node.value)}`}</title>
                        </g>
                    ))}
                </g>
                    <g>
                    {nodes.map(node => (
                            <text
                            key={node.name}
                            x={node.x0 < width / 2 ? node.x0 - 8 : node.x1 + 8}
                            y={node.y0 + (node.y1 - node.y0) / 2}
                            dominantBaseline="middle"
                            textAnchor={node.x0 < width/2 ? 'end' : 'start'}
                            className="text-xs font-semibold fill-current text-siloam-text-primary pointer-events-none"
                        >
                            {node.name}
                        </text>
                    ))}
                </g>
            </svg>
        </div>
    );

    const renderTable = () => (
        <div className="overflow-auto flex-1 h-full min-h-[400px]">
            <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-siloam-bg text-xs uppercase text-siloam-text-secondary font-semibold sticky top-0 z-10">
                    <tr>
                        <th className="px-4 py-3 text-left rounded-tl-lg">Source</th>
                        <th className="px-4 py-3 text-left">Target</th>
                        <th className="px-4 py-3 text-right rounded-tr-lg">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-siloam-border">
                    {data.map((row, idx) => (
                        <tr key={idx} className="hover:bg-siloam-bg/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-siloam-text-primary">{row.source}</td>
                            <td className="px-4 py-3 text-siloam-text-secondary">{row.target}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-siloam-text-primary">{formatCurrency(row.value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderCards = () => (
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto flex-1 h-full min-h-[400px] p-1">
            {data.map((row, idx) => (
                <div key={idx} className="p-4 border border-siloam-border rounded-xl bg-siloam-bg/30 flex flex-col justify-between gap-3 hover:shadow-md transition-shadow">
                    <div className="flex items-center text-sm text-siloam-text-secondary gap-2">
                        <span className="truncate max-w-[45%]">{row.source}</span>
                        <ArrowRightIcon />
                        <span className="font-bold text-siloam-text-primary truncate max-w-[45%]">{row.target}</span>
                    </div>
                    <div className="text-xl font-bold text-siloam-blue">
                        {formatCurrency(row.value)}
                    </div>
                </div>
            ))}
         </div>
    );

    if (!hasData) {
        return (
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft h-full flex flex-col items-center justify-center">
                <h3 className="text-lg font-bold text-siloam-text-primary mb-4 self-start">{title}</h3>
                <p className="text-siloam-text-secondary">No data for Budget Flow.</p>
            </div>
        );
    }

    return (
        <div className="bg-siloam-surface p-6 rounded-xl shadow-soft h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-siloam-text-primary">{title}</h3>
                <div className="flex bg-siloam-bg p-1 rounded-lg border border-siloam-border">
                    <button
                        onClick={() => setViewMode('chart')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'chart' ? 'bg-white shadow-sm text-siloam-blue' : 'text-siloam-text-secondary hover:text-siloam-text-primary'}`}
                        title="Chart View"
                    >
                        <ChartIcon />
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-siloam-blue' : 'text-siloam-text-secondary hover:text-siloam-text-primary'}`}
                        title="Table View"
                    >
                        <TableIcon />
                    </button>
                    <button
                        onClick={() => setViewMode('card')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'card' ? 'bg-white shadow-sm text-siloam-blue' : 'text-siloam-text-secondary hover:text-siloam-text-primary'}`}
                        title="Card View"
                    >
                        <CardIcon />
                    </button>
                </div>
            </div>

            <div className="relative flex-1">
                {viewMode === 'chart' && renderChart()}
                {viewMode === 'table' && renderTable()}
                {viewMode === 'card' && renderCards()}
            </div>
        </div>
    );
});

SankeyDiagram.displayName = "SankeyDiagram";
