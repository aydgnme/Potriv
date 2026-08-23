import Link from "next/link";

import { OPERATING_PROBLEM } from "../../businessPlan";
import { HERO_ASSURANCE } from "../../homeModel";
import { CREATE_WORKSPACE_HREF, HERO } from "../../landingContent";
import { MarketingShell } from "../MarketingShell";
import { ChapterIndex } from "../home/ChapterIndex";
import { DecisionGraph } from "../home/DecisionGraph";
import { EvidenceLedger } from "../home/EvidenceLedger";
import { FinalScene } from "../home/FinalScene";
import { ProposalGate } from "../home/ProposalGate";
import home from "../../styles/home.module.css";

/**
 * Chapter 00 — the executive overview.
 *
 * The page makes one argument and shows one decision the whole way down: a
 * requirement for Project Orion, the evidence behind it, three ranked
 * candidates, the department that owns the answer, and the allocation that
 * results. The hero draws it in full, the ledger states what such a decision
 * needs, the dark section isolates the distinction it turns on, and the closing
 * scene draws the same shape reduced to three nodes.
 *
 * Five sections on five grounds rather than one white document with rules
 * between the parts: warm off-white, white, charcoal, light neutral, deep teal.
 * Crossing a boundary changes the surface under the reader, which is what says
 * a new subject has started.
 *
 * It holds none of the four chapter bodies. Two canonical copies of the same
 * claim is what splitting the pages was for; the index links to them instead.
 *
 * Genuinely public: no cookie read, no session lookup, no backend call. An
 * anonymous visitor and a signed-in one are served identical bytes, which is
 * what lets this route prerender as static.
 */
export function HomePage() {
  return (
    <MarketingShell>
      {/* 01 — the proposition, and the model it rests on, side by side. */}
      <section className={home.hero} aria-labelledby="hero-title">
        <div className={`${home.container} ${home.heroInner}`}>
          <div>
            <p className={home.heroEyebrow}>{HERO.eyebrow}</p>
            <h1 className={home.heroTitle} id="hero-title">
              {HERO.title}
            </h1>
            <p className={home.heroLead}>{HERO.lead}</p>

            <div className={home.heroActions}>
              <Link className={home.heroPrimary} href={CREATE_WORKSPACE_HREF}>
                {HERO.primaryCta}
              </Link>
              <Link className={home.heroSecondary} href="/how-it-works">
                {HERO.secondaryCta}
              </Link>
            </div>

            <p className={home.heroAssurance}>{HERO_ASSURANCE}</p>
          </div>

          {/* The model, demonstrated, before anyone is asked to create anything. */}
          <DecisionGraph />
        </div>
      </section>

      {/* 02 — what a decision like that needs in order to be made well. */}
      <section
        className={`${home.section} ${home.evidence}`}
        aria-labelledby="home-problem"
      >
        <div className={`${home.container} ${home.evidenceInner}`}>
          <div>
            <p className={home.sectionMark}>00.1 EVIDENCE</p>
            <h2 className={home.sectionTitle} id="home-problem">
              {OPERATING_PROBLEM.title}
            </h2>
            <p className={home.sectionLead}>{OPERATING_PROBLEM.lead}</p>
          </div>

          <EvidenceLedger />
        </div>
      </section>

      {/* 03 — the one distinction the product turns on, on the darkest ground. */}
      <section
        className={`${home.section} ${home.gateSection}`}
        aria-labelledby="home-model"
      >
        <div className={home.container}>
          <div className={home.gateHead}>
            <p className={home.sectionMark}>00.2 THE RULE</p>
            <h2 className={home.sectionTitle} id="home-model">
              Proposed and accepted are not the same thing
            </h2>
            <p className={home.sectionLead}>
              {"The sequence is above. This is the rule that governs it, and the " +
                "one distinction the whole product turns on."}
            </p>
          </div>

          <ProposalGate />
        </div>
      </section>

      {/* 04 — where to read next, with what each chapter contains. */}
      <section
        className={`${home.section} ${home.chaptersSection}`}
        aria-labelledby="home-chapters"
      >
        <div className={home.container}>
          <div>
            <p className={home.sectionMark}>00.3 THE PLAN</p>
            <h2 className={home.sectionTitle} id="home-chapters">
              The plan, in four chapters
            </h2>
            <p className={home.sectionLead}>
              {"Each answers one question. They are meant to be read in order, " +
                "but they do not have to be."}
            </p>
          </div>

          <ChapterIndex />
        </div>
      </section>

      <FinalScene />
    </MarketingShell>
  );
}
