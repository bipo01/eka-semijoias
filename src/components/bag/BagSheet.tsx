import { useLocation } from 'react-router-dom';
import { useUi } from '../../store/ui';
import { Sheet } from '../ui/Sheet';
import { BagContents, BagCount } from './BagContents';

export function BagSheet() {
  const open = useUi((s) => s.panel === 'bag');
  const close = useUi((s) => s.closePanel);
  const { pathname } = useLocation();
  return (
    <Sheet
      open={open && pathname !== '/sacola'}
      onClose={close}
      className="md-right"
      title={
        <>
          Sua sacola <BagCount />
        </>
      }
    >
      <BagContents variant="sheet" onNavigate={close} />
    </Sheet>
  );
}
