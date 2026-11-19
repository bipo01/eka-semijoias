import { Link } from 'react-router-dom';
import { Bed, Droplets, FlaskConical, Lock, Package, Sparkles, SprayCan, Wind } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const STEPS = [
  { icon: SprayCan, title: 'Perfume e creme primeiro', text: 'Passe perfume, hidratante e maquiagem, espere secar e só então coloque as peças.' },
  { icon: Droplets, title: 'Tire antes da água', text: 'Banho, piscina, mar e academia: suor, cloro e sal aceleram o desgaste do banho.' },
  { icon: FlaskConical, title: 'Longe de produtos químicos', text: 'Evite contato com álcool em gel, produtos de limpeza, esmalte e acetona.' },
  { icon: Package, title: 'Guarde separado', text: 'Cada peça no seu saquinho ou em um porta-joias com divisórias, para não riscar nem embaraçar.' },
  { icon: Sparkles, title: 'Limpe com flanela seca', text: 'Depois de usar, passe uma flanela macia e seca para tirar a oleosidade da pele.' },
  { icon: Wind, title: 'Fuja da umidade', text: 'Banheiro não é lugar de porta-joias. Prefira um ambiente seco e arejado.' },
  { icon: Bed, title: 'Não durma com elas', text: 'Tirar as peças para dormir evita atrito, amassados e fechos forçados.' },
  { icon: Lock, title: 'Confira os fechos', text: 'De vez em quando, veja se tarraxas, fechos e garras estão firmes.' },
];

export function CarePage() {
  useDocumentTitle('Como cuidar');
  return (
    <div className="pb-16">
      <PageHeader eyebrow="Cuidados" title={<>Como cuidar das suas <em className="font-medium italic">semijoias</em></>} intro="Pequenos hábitos fazem o brilho durar muito mais. Siga estes cuidados no dia a dia." />
      <ol className="container-x grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-4 rounded-[12px] border border-line bg-white p-5 lg:flex-col">
            <span className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-champagne text-copper" aria-hidden="true">
              <Icon size={22} strokeWidth={1.5} />
              <span className="price absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-copper text-[11px] text-white">{i + 1}</span>
            </span>
            <div>
              <h2 className="font-display text-title">{title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <section aria-labelledby="escurece" className="container-x mt-12 lg:mt-16">
        <div className="max-w-3xl rounded-[12px] bg-champagne p-6 lg:p-10">
          <h2 id="escurece" className="font-display text-display-m">Por que o banho escurece?</h2>
          <p className="mt-3 text-ink">
            A semijoia tem uma base de metal coberta por uma camada de ouro ou ródio. O contato frequente com suor, perfume, cremes e produtos químicos vai desgastando essa camada aos poucos. Por isso os cuidados acima fazem tanta diferença: quanto menos atrito e química, mais tempo o brilho dura.
          </p>
          <p className="mt-3 text-ink">
            Notou algo diferente na sua peça? Veja a nossa <Link to="/garantia" className="text-copper underline underline-offset-4">garantia e trocas</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
