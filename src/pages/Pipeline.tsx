import React, { useMemo, useState } from 'react';
import { useContacts } from '../hooks/useContacts';
import { Contact, ContactStage } from '../types';
import { updateContactStage } from '../services/pipeline';
import { ContactDrawer } from '../features/contacts/ContactDrawer';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent
} from '@dnd-kit/core';
import { 
  SortableContext, 
  arrayMove, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { 
  CSS 
} from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';

// Props for droppable column
interface DroppableColumnProps {
  id: string;
  stage: string;
  children: React.ReactNode;
}

const DroppableColumn = ({ id, stage, children }: DroppableColumnProps) => {
  const { isOver, setNodeRef } = useDroppable({
    id: stage,
    data: {
      type: 'Column',
      stage,
    },
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar min-h-[150px] transition-colors ${
        isOver ? 'bg-zinc-800/30' : ''
      }`}
    >
      {children}
    </div>
  );
};
import { Clock, Loader2, Sparkles, MessageSquare, Search, Tag as TagIcon, Filter } from 'lucide-react';

const STAGES: ContactStage[] = [
  'Novo Lead', 'Interessado', 'Orçamento Enviado', 'Negociação', 'Cliente', 'Pós-venda'
];

interface SortableCardProps {
  contact: Contact;
  onClick: (contact: Contact) => void;
  isStagnant: boolean;
  stagnantDays: number;
}

const SortableCard: React.FC<SortableCardProps> = ({ contact, onClick, isStagnant, stagnantDays }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: contact.id, data: { type: 'Contact', contact } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
          // Allow clicking only if not dragging heavily, onClick usually fires anyway if drag didn't move much
          onClick(contact);
      }}
      className={`bg-zinc-800 border p-3 rounded-lg cursor-pointer transform hover:-translate-y-1 hover:shadow-lg transition-all ${
        isStagnant ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'border-zinc-700'
      }`}
    >
      <div className="font-medium text-white text-sm mb-1">{contact.nome}</div>
      <div className="text-xs text-zinc-400 mb-2">{contact.telefoneE164}</div>
      
      {contact.valorEstimado ? (
        <div className="text-sm font-bold text-green-400 mb-2">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contact.valorEstimado)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 mb-2">
        {contact.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-[10px] bg-zinc-900 border border-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 text-zinc-500">
        <div className={`text-[10px] flex items-center gap-1 ${isStagnant ? 'text-red-400 font-medium' : ''}`}>
          <Clock size={10} /> {stagnantDays > 0 ? `${stagnantDays}d` : 'Hoje'}
        </div>
        <div className="flex gap-1" onClick={e => e.stopPropagation() /* Prevent card click when clicking action */}>
            <button className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors" title="Mensagem">
                <MessageSquare size={12} />
            </button>
            <button className="p-1 hover:bg-zinc-700 rounded text-indigo-400 hover:text-indigo-300 transition-colors" title="Gerar com IA">
                <Sparkles size={12} />
            </button>
        </div>
      </div>
    </div>
  );
};

export const Pipeline = () => {
  const { contacts, loading } = useContacts();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeDragContact, setActiveDragContact] = useState<Contact | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStagnantDays, setFilterStagnantDays] = useState<string>('todos');
  const [filterMinValor, setFilterMinValor] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('');

  // Derived state to group contacts
  // We keep a local optimistic state for the drag UI to feel instant
  const [optimisticContacts, setOptimisticContacts] = useState<Contact[]>([]);

  // Sync optimistic with real contacts when it loads or changes
  React.useEffect(() => {
    setOptimisticContacts(contacts);
  }, [contacts]);

  // Apply filters
  const filteredContacts = useMemo(() => {
    const now = Date.now();
    return optimisticContacts.filter(c => {
        if (c.status !== 'active') return false;
        
        if (search) {
            if (!c.nome.toLowerCase().includes(search.toLowerCase())) return false;
        }

        if (filterTag) {
            if (!c.tags.some(t => t.toLowerCase().includes(filterTag.toLowerCase()))) return false;
        }

        const idleLimitDays = parseInt(filterStagnantDays, 10);
        let stagnantDays = 0;
        const refDate = c.stageChangedAt || c.createdAt;
        if (refDate) stagnantDays = Math.floor((now - refDate) / (1000 * 60 * 60 * 24));
        
        if (filterStagnantDays !== 'todos' && stagnantDays < idleLimitDays) {
            return false;
        }

        if (filterMinValor) {
            const minV = parseFloat(filterMinValor);
            if (!isNaN(minV) && (c.valorEstimado || 0) < minV) return false;
        }

        return true;
    });
  }, [optimisticContacts, search, filterStagnantDays, filterMinValor]);

  // Group by stage
  const columns = useMemo(() => {
    const cols: Record<string, Contact[]> = {};
    STAGES.forEach(s => cols[s] = []);
    filteredContacts.forEach(c => {
        if (cols[c.stage]) {
            cols[c.stage].push(c);
        }
    });
    // Sort within columns by somewhat recent
    STAGES.forEach(s => {
        cols[s].sort((a,b) => (b.stageChangedAt || b.createdAt) - (a.stageChangedAt || a.createdAt));
    });
    return cols;
  }, [filteredContacts]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 5, // 5px drag before it activates to allow clicks
        }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const contact = optimisticContacts.find(c => c.id === active.id);
    if (contact) setActiveDragContact(contact);
  };

  const onDragOver = (event: DragOverEvent) => {
    // optional logic for smooth cross container before dropping
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragContact(null);

    if (!over) return;

    // Find the contact being dragged
    const activeContactId = active.id as string;
    const activeContact = optimisticContacts.find(c => c.id === activeContactId);
    
    if (!activeContact) return;

    // Determine target stage
    let targetStage: string | null = null;
    
    if (STAGES.includes(over.id as ContactStage)) {
        // Dropped directly on a column droppable
        targetStage = over.id as string;
    } else {
        // Dropped on another item
        const overContact = optimisticContacts.find(c => c.id === over.id);
        if (overContact) targetStage = overContact.stage;
    }

    if (!targetStage || activeContact.stage === targetStage) {
        return; // No change
    }

    // Optimistic Update
    const newStage = targetStage as ContactStage;
    setOptimisticContacts(prev => prev.map(c => 
        c.id === activeContactId 
          ? { ...c, stage: newStage, stageChangedAt: Date.now() } 
          : c
    ));

    // Persist
    try {
        await updateContactStage(activeContactId, activeContact.stage, newStage);
    } catch (e) {
        console.error("Failed to update stage", e);
        // Rollback (relying on next snapshot to fix, or we could manually revert)
    }
  };

  const getStagnantDays = (c: Contact) => {
      const refDate = c.stageChangedAt || c.createdAt;
      return Math.floor((Date.now() - refDate) / (1000 * 60 * 60 * 24));
  };


  return (
    <div className="h-full flex flex-col p-6 w-full max-w-full overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Pipeline</h1>
          <p className="text-zinc-400 mt-1">Gerencie oportunidades e acompanhe o funil de vendas</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar negócio (nome)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        
        <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
          <Filter size={16} className="text-zinc-500 mr-1" />
          
          <select 
            value={filterStagnantDays}
            onChange={e => setFilterStagnantDays(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-2 text-sm focus:outline-none w-36 shrink-0"
          >
            <option value="todos">Qualquer prazo</option>
            <option value="7">Parados {'>'} 7 dias</option>
            <option value="15">Parados {'>'} 15 dias</option>
          </select>

          <input 
            type="text"
            placeholder="Tag..."
            value={filterTag}
            onChange={e => setFilterTag(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-28 shrink-0"
          />
          
          <input 
            type="number"
            placeholder="Valor Mín. (R$)"
            value={filterMinValor}
            onChange={e => setFilterMinValor(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-32 shrink-0"
          />
        </div>
      </div>

      {loading && optimisticContacts.length === 0 ? (
        <div className="flex-1 flex justify-center items-center">
            <Loader2 size={32} className="animate-spin text-zinc-500 mb-4" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
            <DndContext 
                sensors={sensors} 
                collisionDetection={closestCorners} 
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
            >
                <div className="flex gap-4 h-full items-start min-w-max">
                    {STAGES.map(stage => {
                        const colContacts = columns[stage] || [];
                        const colValue = colContacts.reduce((sum, c) => sum + (c.valorEstimado || 0), 0);
                        
                        return (
                            <div key={stage} className="flex flex-col bg-zinc-900/50 border border-zinc-800 rounded-xl w-72 max-h-full shrink-0">
                                <div className="p-3 border-b border-zinc-800 bg-zinc-950/50 rounded-t-xl sticky top-0 z-10 flex flex-col gap-1">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-semibold text-white text-sm uppercase tracking-wider">{stage}</h3>
                                        <span className="bg-zinc-800 text-zinc-300 text-xs py-0.5 px-2 rounded-full font-medium">
                                            {colContacts.length}
                                        </span>
                                    </div>
                                    <div className="text-xs text-green-400 font-medium">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(colValue)}
                                    </div>
                                </div>
                                
                                <DroppableColumn id={stage} stage={stage}>
                                    <SortableContext 
                                        id={stage}
                                        items={colContacts.map(c => c.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {colContacts.map(contact => {
                                            const days = getStagnantDays(contact);
                                            return (
                                                <SortableCard 
                                                    key={contact.id} 
                                                    contact={contact} 
                                                    onClick={setSelectedContact}
                                                    isStagnant={days >= 7}
                                                    stagnantDays={days}
                                                />
                                            );
                                        })}
                                        {colContacts.length === 0 && (
                                            <div className="h-24 border-2 border-dashed border-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-xs p-4 text-center">
                                                Arraste leads para esta etapa
                                            </div>
                                        )}
                                    </SortableContext>
                                </DroppableColumn>
                            </div>
                        );
                    })}
                </div>
                
                <DragOverlay>
                    {activeDragContact ? (
                        <div className="opacity-80 rotate-2 scale-105 pointer-events-none">
                            <SortableCard 
                                contact={activeDragContact} 
                                onClick={() => {}} 
                                isStagnant={getStagnantDays(activeDragContact) >= 7}
                                stagnantDays={getStagnantDays(activeDragContact)}
                            />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
      )}
      <ContactDrawer contact={selectedContact} onClose={() => setSelectedContact(null)} />
    </div>
  );
};
