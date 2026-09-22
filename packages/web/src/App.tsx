import { Board } from './features/ideas/Board';
import { CaptureForm } from './features/ideas/CaptureForm';
import { IdeaDialog } from './features/ideas/IdeaDialog';
import { useSelectedIdea } from './features/ideas/useSelectedIdea';

export function App() {
  const [selected, setSelected] = useSelectedIdea();

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Project Planner</h1>
        <CaptureForm />
      </header>
      <Board onOpen={setSelected} />
      {selected ? (
        <IdeaDialog key={selected} id={selected} onClose={() => setSelected(null)} />
      ) : null}
    </main>
  );
}
