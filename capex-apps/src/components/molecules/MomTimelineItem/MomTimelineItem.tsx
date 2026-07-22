import React from 'react';
import { MOM } from '../../../types';

const Icon = () => (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-purple-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
    </div>
);

interface MomTimelineItemProps {
    mom: MOM;
}

export const MomTimelineItem: React.FC<MomTimelineItemProps> = ({ mom }) => {
    return (
        <div className="relative flex items-start pl-16">
            <div className="absolute left-5 top-5 w-11 border-t-2 border-dashed border-siloam-border"></div>
            <div className="flex-shrink-0 z-10">
                <Icon />
            </div>
            <div className="ml-6 flex-1 pt-1">
                <div className="bg-siloam-bg/50 border border-dashed border-siloam-border p-4 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-bold text-lg text-siloam-text-primary">Meeting Note (MOM)</p>
                            <p className="text-xs text-siloam-text-secondary">
                                Logged by {mom.createdByUsername} on {new Date(mom.createdAt).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-siloam-border/50">
                        <p className="text-sm text-siloam-text-primary whitespace-pre-wrap">{mom.content}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};