export type ADRStatus = 'PROPOSED' | 'ACCEPTED' | 'SUPERSEDED';

export interface ADR {
  id: string;
  title: string;
  date: string;
  status: ADRStatus;
  tags: string[];
  links?: { target: string; type: string }[];
}

export const MOCK_ADRS: ADR[] = [
  {
    id: '005',
    title: 'Use PostgreSQL for Data Persistence',
    date: '2024-07-15',
    status: 'PROPOSED',
    tags: ['backend', 'database'],
    links: [{ target: '004', type: 'relationship' }, { target: '002', type: 'relationship' }]
  },
  {
    id: '004',
    title: 'Use Accept for Key station working',
    date: '2024-07-15',
    status: 'ACCEPTED',
    tags: ['backend', 'database'],
    links: [{ target: '001', type: 'relationship' }]
  },
  {
    id: '003',
    title: 'Use Packerunn for Data Managers',
    date: '2024-07-15',
    status: 'ACCEPTED',
    tags: ['backend', 'database'],
    links: [{ target: '005', type: 'relationship' }]
  },
  {
    id: '002',
    title: 'Use Assess to developtions',
    date: '2024-07-15',
    status: 'SUPERSEDED',
    tags: ['backend', 'database'],
    links: [{ target: '001', type: 'relationship' }]
  },
  {
    id: '001',
    title: 'Use PostgreSQL for Data Persistence',
    date: '2024-07-15',
    status: 'PROPOSED',
    tags: ['backend', 'database'],
  }
];
