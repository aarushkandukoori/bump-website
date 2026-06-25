import { FeatureCarousel } from './components/FeatureCarousel';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { WhatIsBump } from './components/WhatIsBump';
import { HowItWorks } from './components/HowItWorks';
import { Team } from './components/Team';
import { Research } from './components/Research';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';

function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhatIsBump />
        <HowItWorks />
        <FeatureCarousel />
        <Research />
        <Team />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

export default App;
