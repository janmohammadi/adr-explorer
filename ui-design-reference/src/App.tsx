import { useState, useMemo } from 'react';
import { MOCK_ADRS, ADRStatus } from './types';
import { TimelineView } from './TimelineView';
import { GraphView } from './GraphView';
import { LayoutGrid, Maximize2, MoreHorizontal, X, Search, Filter } from 'lucide-react';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ADRStatus | 'ALL'>('ALL');

  const filteredAdrs = useMemo(() => {
    return MOCK_ADRS.filter(adr => {
      const matchesSearch = adr.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           adr.id.includes(searchQuery) ||
                           adr.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'ALL' || adr.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter]);

  return (
    <div className="h-screen w-screen flex flex-col bg-bg-dark text-gray-300">
      {/* Header / Tab Bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-800 bg-panel-dark">
        <div className="flex items-center gap-4 h-full">
          <div className="flex items-center gap-2 px-3 h-full border-r border-gray-800 text-xs font-medium bg-bg-dark">
            <LayoutGrid size={14} className="text-gray-500" />
            ADR Explorer
            <X size={12} className="ml-2 text-gray-600 hover:text-gray-400 cursor-pointer" />
          </div>
          
          {/* Search and Filter UI */}
          <div className="flex items-center gap-3 ml-2">
            <div className="relative group">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-gray-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Search ADRs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-bg-dark border border-gray-800 rounded px-3 py-1 pl-8 text-xs focus:outline-none focus:border-gray-600 w-48 transition-all"
              />
            </div>
            
            <div className="flex items-center gap-1 bg-bg-dark border border-gray-800 rounded px-2 py-1">
              <Filter size={12} className="text-gray-600" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent text-[10px] font-mono focus:outline-none cursor-pointer text-gray-400"
              >
                <option value="ALL">ALL STATUS</option>
                <option value="PROPOSED">PROPOSED</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="SUPERSEDED">SUPERSEDED</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-mono text-gray-600 mr-4">
            {filteredAdrs.length} of {MOCK_ADRS.length} records
          </div>
          <Maximize2 size={14} className="text-gray-500 hover:text-gray-300 cursor-pointer" />
          <MoreHorizontal size={14} className="text-gray-500 hover:text-gray-300 cursor-pointer" />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Timeline */}
        <div className="w-1/3 min-w-[350px]">
          <TimelineView adrs={filteredAdrs} />
        </div>

        {/* Right Panel: Graph */}
        <div className="flex-1">
          <GraphView adrs={filteredAdrs} />
        </div>
      </main>
    </div>
  );
}
