import { CareTeaser } from '../components/home/CareTeaser';
import { CategoryRail } from '../components/home/CategoryRail';
import { Faq } from '../components/home/Faq';
import { Hero } from '../components/home/Hero';
import { InstagramStrip } from '../components/home/InstagramStrip';
import { NewArrivals } from '../components/home/NewArrivals';
import { ResellerBand } from '../components/home/ResellerBand';
import { Testimonials } from '../components/home/Testimonials';
import { TrustStrip } from '../components/home/TrustStrip';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function HomePage() {
  useDocumentTitle(null);
  return (
    <>
      <Hero />
      <TrustStrip />
      <CategoryRail />
      <NewArrivals />
      <ResellerBand />
      <CareTeaser />
      <Testimonials />
      <InstagramStrip />
      <Faq />
    </>
  );
}
