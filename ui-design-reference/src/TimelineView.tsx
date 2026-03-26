import React from 'react';
import { ADR, ADRStatus } from './types';

interface TimelineViewProps {
  adrs: ADR[];
}

const STATUS_COLORS: Record<ADRStatus, string> = {
  PROPOSED: 'bg-proposed',
  ACCEPTED: 'bg-accepted',
  SUPERSEDED: 'bg-superseded',
};

export const TimelineView: React.FC<TimelineViewProps> = ({ adrs }) => {
  return (
    <div className="w-full h-full bg-bg-dark border-r border-gray-800 flex flex-col grid-background">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-panel-dark/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
          <div className="w-3 h-3 border border-gray-700 flex items-center justify-center">
            <div className="w-1 h-1 bg-gray-700"></div>
          </div>
          ADR Timeline
        </div>
        <div className="flex gap-4 text-[10px] font-bold tracking-wider">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-proposed shadow-[0_0_4px_rgba(242,125,38,0.5)]"></div>
            <span className="text-gray-400">PROPOSED</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accepted shadow-[0_0_4px_rgba(59,130,246,0.5)]"></div>
            <span className="text-gray-400">ACCEPTED</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-superseded shadow-[0_0_4px_rgba(239,68,68,0.5)]"></div>
            <span className="text-gray-400">SUPERSEDED</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-0 relative">
        {/* Timeline line - dashed to match graph */}
        <div className="absolute left-14 top-0 bottom-0 w-[1px] border-l border-dashed border-gray-700"></div>
        
        <div className="py-4">
          {adrs.map((adr, index) => (
            <div key={`${adr.id}-${index}`} className="relative flex items-start gap-0 group hover:bg-white/[0.02] transition-colors py-3">
              {/* Line number / index */}
              <div className="w-10 text-right pr-4 text-[10px] font-mono text-gray-600 mt-1.5 select-none">
                {(index + 1).toString().padStart(2, '0')}
              </div>

              {/* Dot container */}
              <div className="w-8 flex justify-center shrink-0 relative z-10">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 border-2 border-bg-dark transition-all duration-300 group-hover:scale-125 group-hover:shadow-[0_0_8px_currentColor] ${STATUS_COLORS[adr.status].replace('bg-', 'bg-')} ${adr.status === 'PROPOSED' ? 'text-proposed' : adr.status === 'ACCEPTED' ? 'text-accepted' : 'text-superseded'}`}></div>
              </div>
              
              <div className="flex-1 pl-6 pr-8 flex flex-col gap-0.5">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-gray-500 bg-gray-800/50 px-1 py-0 rounded leading-none">#{adr.id}</span>
                  <h3 className="text-xs font-medium text-gray-200 group-hover:text-white transition-colors cursor-pointer tracking-tight truncate max-w-[200px]">
                    {adr.title}
                  </h3>
                </div>
                
                <div className="flex items-center gap-3 text-[9px] font-mono text-gray-600">
                  <div className="flex items-center gap-1">
                    <span className="opacity-50">date:</span>
                    <span className="text-gray-500">{adr.date}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="opacity-50">tags:</span>
                    <div className="flex gap-1">
                      {adr.tags.map(tag => (
                        <span key={tag} className="text-gray-500 hover:text-gray-400 cursor-pointer">
                          "{tag}"
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {adrs.length === 0 && (
            <div className="p-8 text-center text-xs font-mono text-gray-600">
              No records match your search criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
