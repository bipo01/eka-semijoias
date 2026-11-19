import { BagContents } from '../components/bag/BagContents';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function BagPage() {
  useDocumentTitle('Sacola');
  return (
    <div className="container-x pt-8 pb-16 lg:pt-12">
      <h1 className="mb-6 font-display text-display-l">Sua sacola</h1>
      <BagContents variant="page" />
    </div>
  );
}
