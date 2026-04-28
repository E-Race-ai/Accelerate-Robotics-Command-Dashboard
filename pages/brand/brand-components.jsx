// brand-components.jsx — all the content blocks for the brand guidelines doc.
// Split out so the main HTML stays thin.

// ── Logo directions ────────────────────────────────────────────────────────

function LogoAurora({ color = '#FF6A3D', accent = '#13C2A8', ink = '#0E1420', label = true }) {
  return (
    <svg viewBox="0 0 320 120" width="100%" style={{ maxWidth: 320 }}>
      <defs>
        <radialGradient id="la-g" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".55"/>
          <stop offset="55%" stopColor={color}/>
          <stop offset="100%" stopColor={color} stopOpacity=".85"/>
        </radialGradient>
      </defs>
      <circle cx="54" cy="60" r="36" fill="url(#la-g)"/>
      <circle cx="54" cy="60" r="36" fill="none" stroke={accent} strokeWidth="1.2" opacity=".5"/>
      <circle cx="54" cy="60" r="8" fill={ink}/>
      {label && (
        <g fill={ink}>
          <text x="108" y="58" fontFamily="Instrument Serif, serif" fontSize="26" letterSpacing="-0.5">Accelerate</text>
          <text x="108" y="84" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" letterSpacing="3">ROBOTICS</text>
        </g>
      )}
    </svg>
  );
}

function LogoOrbit({ color = '#FF6A3D', accent = '#13C2A8', ink = '#0E1420', label = true }) {
  return (
    <svg viewBox="0 0 320 120" width="100%" style={{ maxWidth: 320 }}>
      <g transform="translate(54,60)">
        <ellipse cx="0" cy="0" rx="34" ry="14" fill="none" stroke={ink} strokeWidth="1.5"/>
        <ellipse cx="0" cy="0" rx="34" ry="14" fill="none" stroke={accent} strokeWidth="1.5" transform="rotate(60)"/>
        <ellipse cx="0" cy="0" rx="34" ry="14" fill="none" stroke={ink} strokeWidth="1.5" transform="rotate(120)"/>
        <circle cx="0" cy="0" r="7" fill={color}/>
      </g>
      {label && (
        <g fill={ink}>
          <text x="108" y="54" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="22" letterSpacing="-0.5">accelerate</text>
          <text x="108" y="80" fontFamily="JetBrains Mono, monospace" fontWeight="500" fontSize="11" letterSpacing="3">/ ROBOTICS</text>
        </g>
      )}
    </svg>
  );
}

function LogoChevron({ color = '#FF6A3D', ink = '#0E1420', label = true }) {
  return (
    <svg viewBox="0 0 320 120" width="100%" style={{ maxWidth: 320 }}>
      <g transform="translate(20,28)">
        <path d="M0 32 L32 0 L44 0 L12 32 L44 64 L32 64 Z" fill={ink}/>
        <path d="M20 32 L52 0 L64 0 L32 32 L64 64 L52 64 Z" fill={color}/>
      </g>
      {label && (
        <g fill={ink}>
          <text x="108" y="58" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="26" letterSpacing="-0.8">Accelerate</text>
          <text x="108" y="82" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="13" letterSpacing="1" fill="#3A4352">Robotics</text>
        </g>
      )}
    </svg>
  );
}

function LogoBrain({ color = '#FF6A3D', accent = '#13C2A8', ink = '#0E1420', label = true }) {
  // node graph — "one brain, many bots"
  return (
    <svg viewBox="0 0 320 120" width="100%" style={{ maxWidth: 320 }}>
      <g transform="translate(54,60)">
        <line x1="0" y1="0" x2="-28" y2="-18" stroke={ink} strokeWidth="1.5" opacity=".6"/>
        <line x1="0" y1="0" x2="28" y2="-18" stroke={ink} strokeWidth="1.5" opacity=".6"/>
        <line x1="0" y1="0" x2="-30" y2="12" stroke={ink} strokeWidth="1.5" opacity=".6"/>
        <line x1="0" y1="0" x2="30" y2="12" stroke={ink} strokeWidth="1.5" opacity=".6"/>
        <line x1="0" y1="0" x2="0" y2="26" stroke={ink} strokeWidth="1.5" opacity=".6"/>
        <circle cx="0" cy="0" r="10" fill={color}/>
        <circle cx="-28" cy="-18" r="4" fill={ink}/>
        <circle cx="28" cy="-18" r="4" fill={accent}/>
        <circle cx="-30" cy="12" r="4" fill={ink}/>
        <circle cx="30" cy="12" r="4" fill={ink}/>
        <circle cx="0" cy="26" r="4" fill={accent}/>
      </g>
      {label && (
        <g fill={ink}>
          <text x="120" y="56" fontFamily="Instrument Serif, serif" fontSize="28" letterSpacing="-0.5" fontStyle="italic">Accelerate</text>
          <text x="120" y="82" fontFamily="JetBrains Mono, monospace" fontSize="11" letterSpacing="4" fontWeight="500">ROBOTICS</text>
        </g>
      )}
    </svg>
  );
}

const LOGO_REGISTRY = {
  aurora:  { name: 'Aurora',  desc: 'Warm orb over soft orbit. The "brain" made visible. Strongest alignment with Atlas heritage + optimistic-human direction.', Component: LogoAurora },
  orbit:   { name: 'Orbit',   desc: 'Three elliptical orbits around a single core. Literal "one brain, many bots." Geometric, pattern-friendly.', Component: LogoOrbit },
  chevron: { name: 'Chevron', desc: 'Double chevron — forward motion, acceleration. The most "venture-y" direction; furthest from Atlas.', Component: LogoChevron },
  brain:   { name: 'Node',    desc: 'Hub-and-spoke node graph. Tells the platform story immediately — orchestration, not hardware.', Component: LogoBrain },
};

// ── Color palettes ─────────────────────────────────────────────────────────

const PALETTES = {
  safe: {
    name: 'Safe pick — Atlas-adjacent',
    subtitle: 'Inherits Atlas navy + the Atlas orange, adds a calm teal and warm paper neutrals. Reads as a sibling brand, not a departure.',
    tokens: {
      primary:     { name: 'Ember',    hex: '#FF6A3D', use: 'Hero accent, CTAs, highlight marks. Use sparingly — one per screen.' },
      ink:         { name: 'Ink',      hex: '#0E1420', use: 'Body text, logo, solid dark surfaces. The grown-up anchor.' },
      ink2:        { name: 'Ink-2',    hex: '#3A4352', use: 'Secondary text, meta, dividers at higher contrast.' },
      paper:       { name: 'Paper',    hex: '#F6F4EE', use: 'Default background. Slightly warm, avoids clinical white.' },
      paper2:      { name: 'Paper-2',  hex: '#ECE8DB', use: 'Card backgrounds, section stripes.' },
      signal:      { name: 'Signal',   hex: '#FFD84D', use: 'Data highlights, "new" badges, small attention moments.' },
      success:     { name: 'Running',  hex: '#13C2A8', use: 'System state: green/running, operational health.' },
      warning:     { name: 'Pending',  hex: '#F5A623', use: 'System state: attention, awaiting action.' },
      danger:      { name: 'Fault',    hex: '#E5484D', use: 'System state: fault, offline, blocking error.' },
    }
  },
  bold: {
    name: 'Bold pick — platform-forward',
    subtitle: 'Near-black surfaces, a signal-orange primary, electric cyan accent. More "infrastructure" than "service." Harder to co-brand, more memorable solo.',
    tokens: {
      primary:     { name: 'Ignition', hex: '#FF4D1F', use: 'Hero accent, key UI affordances. One hero per screen.' },
      ink:         { name: 'Onyx',     hex: '#0A0D14', use: 'Default surface in dark mode; body text in light.' },
      ink2:        { name: 'Graphite', hex: '#4A5160', use: 'Secondary surface and text.' },
      paper:       { name: 'Bone',     hex: '#FAF8F3', use: 'Light-mode surface, bright but not cold.' },
      paper2:      { name: 'Fog',      hex: '#E5E2D8', use: 'Card backgrounds.' },
      signal:      { name: 'Pulse',    hex: '#00E5FF', use: 'Data, live indicators, motion trails. Electric.' },
      success:     { name: 'Running',  hex: '#22D3A6', use: 'Operational state.' },
      warning:     { name: 'Pending',  hex: '#FBBF24', use: 'Attention state.' },
      danger:      { name: 'Fault',    hex: '#FF3B4A', use: 'Error state.' },
    }
  }
};

// ── Sections ───────────────────────────────────────────────────────────────

function S_Foundation({ t }) {
  return (
    <section id="foundation" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>01</span> Foundation</div>
        <h2>What we stand for.</h2>
      </div>

      <div className="grid grid-12 tight">
        <div className="col-7">
          <div className="kpair"><span className="k">Parent</span><span className="v">Atlas Mobility (est. 2009 as Atlas Lift Tech). National footprint in hospitals, rebranded 2025. Human + hardware + software.</span></div>
          <div className="kpair"><span className="k">Venture</span><span className="v">Accelerate Robotics. Same DNA, new frontier: the operating system for facility robotics across hospitality, senior living, and healthcare.</span></div>
          <div className="kpair"><span className="k">HQ</span><span className="v">Miami, FL.</span></div>
          <div className="kpair"><span className="k">Tagline</span><span className="v" style={{fontStyle:'italic',fontFamily:'var(--font-display)'}}>One brain. Many bots.</span></div>
        </div>
        <div className="col-5">
          <div className="note">
            <b>Relationship to Atlas</b>
            Accelerate Robotics <em>is</em> Atlas — at a bigger altitude. Atlas earned the right to orchestrate facility robotics by spending 15 years being trusted at the bedside. The brand should feel like an ambitious sibling, not a pivot.
          </div>
        </div>
      </div>

      <div className="sec-sub">Mission · Vision · Positioning</div>
      <div className="mvp">
        <div className="mvp-card">
          <div className="mvp-lbl">MISSION</div>
          <p>Improve staff efficiency and guest experience by making every robot in the building work as one — supporting the people who run facilities, never replacing them.</p>
        </div>
        <div className="mvp-card">
          <div className="mvp-lbl">VISION</div>
          <p>A world where hotels, care communities, and hospitals run on coordinated robot fleets — lifting staff productivity and elevating every guest, resident, and patient experience along the way.</p>
        </div>
        <div className="mvp-card">
          <div className="mvp-lbl">POSITIONING</div>
          <p>The operating system for facility robotics. Android for the buildings where people live and heal — the orchestration layer that turns robots into measurable gains in staff efficiency and guest experience.</p>
        </div>
      </div>
      <div className="note" style={{marginTop:20}}>
        <b>Parent parallel</b>
        Atlas Mobility's north stars are <em>staff safety</em> and <em>patient outcomes</em>. Accelerate Robotics translates the same shape into a broader venue: <em>staff efficiency</em> and <em>guest experience</em>. Same company DNA, wider aperture.
      </div>

      <div className="sec-sub">Messaging pillars</div>
      <div className="pillars">
        {[
          ['Platform, not hardware', 'The value sits above the robots. We\'re Android; everyone else is a phone.'],
          ['Human layer, first', 'Fleet techs and ops coordinators are part of the product. Robots without people break.'],
          ['Compliance from Day 1', 'HIPAA, FDA, Joint Commission, OSHA, brand standards — built in, per vertical.'],
          ['Proof before promise', 'Atlas\'s 77% HAPI reduction is our credibility. We lead with outcomes, not demos.'],
        ].map(([title, body], i) => (
          <div className="pillar" key={i}>
            <div className="pillar-n">0{i+1}</div>
            <div className="pillar-t">{title}</div>
            <div className="pillar-b">{body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function S_Voice({ t }) {
  return (
    <section id="voice" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>02</span> Voice & tone</div>
        <h2>Optimistic, grounded, technically fluent. Never hype.</h2>
      </div>

      <div className="vt-grid">
        <div>
          <div className="kpair"><span className="k">We are</span><span className="v">Plain-spoken. Operationally literate. Quietly confident.</span></div>
          <div className="kpair"><span className="k">We are not</span><span className="v">Breathless. Sci-fi. Hostile to the status quo. Anti-worker.</span></div>
          <div className="kpair"><span className="k">We sound like</span><span className="v">An ops lead who's seen it work, not a founder on a stage.</span></div>
        </div>
        <div className="dial">
          <ToneDial label="Formal" opposite="Casual" value={t.voice_formal} />
          <ToneDial label="Technical" opposite="Plain" value={t.voice_technical} />
          <ToneDial label="Serious" opposite="Playful" value={t.voice_serious} />
          <ToneDial label="Atlas" opposite="Venture" value={t.voice_parent} />
        </div>
      </div>

      <div className="sec-sub">The same idea, three ways</div>
      <div className="voice-ex">
        <div className="ex">
          <div className="ex-ctx">Investor deck title slide</div>
          <p>"The platform layer for facility robotics."</p>
        </div>
        <div className="ex">
          <div className="ex-ctx">Hospital CNO conversation</div>
          <p>"Your robots ride the elevator, know what the floor needs, and stop talking to each other through your staff."</p>
        </div>
        <div className="ex">
          <div className="ex-ctx">Recruiting post</div>
          <p>"We build the operating system for the robots showing up in every hospital, hotel, and care home. Come build it with us."</p>
        </div>
      </div>

      <div className="sec-sub">Do / Don't</div>
      <div className="do-dont">
        <div className="do">
          <div className="dd-lbl">Do</div>
          <ul>
            <li>"Supports the workforce." Robots reduce injury and expand capacity.</li>
            <li>"Orchestrates fleets." Specific verb, specific object.</li>
            <li>"77% reduction in pressure injuries." Atlas numbers are our credibility.</li>
            <li>Short sentences. Active voice. One idea per line.</li>
          </ul>
        </div>
        <div className="dont">
          <div className="dd-lbl">Don't</div>
          <ul>
            <li>"Replaces humans." Ever. Not even aspirationally.</li>
            <li>"Revolutionary." "Game-changing." "Disruptive."</li>
            <li>Emoji in formal contexts. Robot emoji, never.</li>
            <li>AI mysticism — the product is orchestration, not magic.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ToneDial({ label, opposite, value }) {
  return (
    <div className="tone">
      <div className="tone-lbls"><span>{label}</span><span>{opposite}</span></div>
      <div className="tone-track"><div className="tone-thumb" style={{left: `calc(${value}% - 6px)`}}/></div>
    </div>
  );
}

function S_Logo({ t, setTweak }) {
  const active = LOGO_REGISTRY[t.logoDirection];
  const Comp = active.Component;
  const colors = PALETTES[t.palette].tokens;
  return (
    <section id="logo" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>03</span> Logo</div>
        <h2>Four directions — one recommendation.</h2>
        <p className="lede">No logo is locked. The Aurora direction is our recommended starting point because it carries the most Atlas DNA into a platform context. Click a direction to see it applied everywhere in this doc.</p>
      </div>

      <div className="logo-grid">
        {Object.entries(LOGO_REGISTRY).map(([key, v]) => {
          const C = v.Component;
          const selected = key === t.logoDirection;
          return (
            <button
              key={key}
              className={'logo-card' + (selected ? ' selected' : '')}
              onClick={() => setTweak('logoDirection', key)}
            >
              <div className="logo-stage">
                <C color={colors.primary.hex} accent={colors.success.hex} ink={colors.ink.hex}/>
              </div>
              <div className="logo-meta">
                <div className="logo-name">
                  <span>{v.name}</span>
                  {key === 'aurora' && <span className="rec-pill">Recommended</span>}
                </div>
                <p>{v.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="sec-sub">Clear space & minimum size</div>
      <div className="clearspace">
        <div className="cs-stage">
          <div className="cs-x cs-x-tl">x</div>
          <div className="cs-x cs-x-tr">x</div>
          <div className="cs-x cs-x-bl">x</div>
          <div className="cs-x cs-x-br">x</div>
          <div className="cs-frame">
            <Comp color={colors.primary.hex} accent={colors.success.hex} ink={colors.ink.hex}/>
          </div>
        </div>
        <div className="cs-rules">
          <div className="kpair"><span className="k">Clear space</span><span className="v">Minimum padding equals <b>x</b> — the height of the wordmark cap. Never crowd.</span></div>
          <div className="kpair"><span className="k">Min size (digital)</span><span className="v">120px wide for the lockup. Mark-only acceptable at 24px.</span></div>
          <div className="kpair"><span className="k">Min size (print)</span><span className="v">1.0" wide for the lockup. Mark-only at 0.25".</span></div>
          <div className="kpair"><span className="k">Do not</span><span className="v">Rotate, recolor outside the palette, outline, add shadow, stretch, or place on busy imagery without a backdrop.</span></div>
        </div>
      </div>

      <div className="sec-sub">Lockups</div>
      <div className="lockup-grid">
        <div className="lockup"><div className="lockup-stage light"><Comp color={colors.primary.hex} accent={colors.success.hex} ink={colors.ink.hex}/></div><div className="lockup-lbl">Primary on Paper</div></div>
        <div className="lockup"><div className="lockup-stage dark" style={{background:colors.ink.hex}}><Comp color={colors.primary.hex} accent={colors.success.hex} ink={colors.paper.hex}/></div><div className="lockup-lbl">Reverse on Ink</div></div>
        <div className="lockup"><div className="lockup-stage primary" style={{background:colors.primary.hex}}><Comp color={colors.paper.hex} accent={colors.paper.hex} ink={colors.paper.hex}/></div><div className="lockup-lbl">Knockout on Ember</div></div>
        <div className="lockup"><div className="lockup-stage mono"><Comp color={colors.ink.hex} accent={colors.ink.hex} ink={colors.ink.hex}/></div><div className="lockup-lbl">Mono — for fax, engraving, single-color press</div></div>
      </div>
    </section>
  );
}

function S_Color({ t, setTweak }) {
  const p = PALETTES[t.palette];
  return (
    <section id="color" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>04</span> Color</div>
        <h2>Two systems on the table.</h2>
        <p className="lede">The safe pick reads as an Atlas sibling. The bold pick puts the platform first. Toggle to see everything in this doc re-color instantly. Edit any swatch in Tweaks.</p>
      </div>

      <div className="palette-toggle">
        {['safe', 'bold'].map(k => (
          <button key={k} className={'pt-btn' + (t.palette === k ? ' active' : '')} onClick={() => setTweak('palette', k)}>
            <span className="pt-dot" style={{background: PALETTES[k].tokens.primary.hex}}/>
            <span>{PALETTES[k].name}</span>
          </button>
        ))}
      </div>
      <p className="palette-sub">{p.subtitle}</p>

      <div className="swatch-grid">
        {Object.entries(p.tokens).map(([k, tok]) => (
          <div className="swatch" key={k}>
            <div className="swatch-chip" style={{background: tok.hex, color: ['paper','paper2','signal'].includes(k) ? '#0E1420' : '#fff'}}>
              <span className="swatch-hex">{tok.hex}</span>
            </div>
            <div className="swatch-name">{tok.name}</div>
            <div className="swatch-use">{tok.use}</div>
          </div>
        ))}
      </div>

      <div className="sec-sub">Proportions — the 60/30/10 rule</div>
      <div className="ratio">
        <div style={{flex:60, background: p.tokens.paper.hex, color: p.tokens.ink.hex}}>60% Paper</div>
        <div style={{flex:30, background: p.tokens.ink.hex, color: p.tokens.paper.hex}}>30% Ink</div>
        <div style={{flex:10, background: p.tokens.primary.hex, color: '#fff'}}>10% {p.tokens.primary.name}</div>
      </div>
      <p className="caption">Paper dominates. Ink structures. The primary is punctuation — one hero moment per screen.</p>

      <div className="sec-sub">Semantic & system</div>
      <div className="semantic">
        {['success','warning','danger','signal'].map(k => (
          <div className="sem-row" key={k}>
            <span className="sem-dot" style={{background: p.tokens[k].hex}}/>
            <span className="sem-name">{p.tokens[k].name}</span>
            <span className="sem-hex">{p.tokens[k].hex}</span>
            <span className="sem-use">{p.tokens[k].use}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function S_Typography({ t, setTweak }) {
  const pairs = {
    editorial: {
      label: 'Editorial pair (recommended)',
      desc: 'Instrument Serif for display — confident, humane, premium. Inter for UI & body — workhorse, 0 issues at scale. JetBrains Mono for data & code.',
      display: 'Instrument Serif', body: 'Inter', mono: 'JetBrains Mono',
    },
    modern: {
      label: 'Modern geometric',
      desc: 'Space Grotesk display + Inter body. Techier, more "platform", less obviously tied to healthcare.',
      display: 'Space Grotesk', body: 'Inter', mono: 'JetBrains Mono',
    },
  };
  const active = pairs[t.typePair];
  const colors = PALETTES[t.palette].tokens;
  return (
    <section id="typography" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>05</span> Typography</div>
        <h2>A serif for meaning. A sans for work.</h2>
      </div>

      <div className="type-toggle">
        {Object.entries(pairs).map(([k, v]) => (
          <button key={k} className={'pt-btn' + (t.typePair === k ? ' active' : '')} onClick={() => setTweak('typePair', k)}>
            <span style={{fontFamily: v.display}}>Aa</span>
            <span>{v.label}</span>
          </button>
        ))}
      </div>
      <p className="palette-sub">{active.desc}</p>

      <div className="type-specimen">
        <div className="ts-display" style={{fontFamily: active.display}}>One brain. Many bots.</div>
        <div className="ts-sub" style={{fontFamily: active.body}}>The operating system for facility robotics — coordinating fleets across hotels, care communities, and hospitals.</div>
      </div>

      <div className="sec-sub">Scale</div>
      <div className="scale">
        {[
          ['Display', 72, 700, 'display', '-0.02em', 1, 'Hero headlines only. One per screen. Never stack.'],
          ['H1', 48, 600, 'display', '-0.015em', 1.05, 'Section openers.'],
          ['H2', 32, 600, 'display', '-0.01em', 1.1, 'Subsection.'],
          ['H3', 22, 600, 'body', '-0.005em', 1.25, 'Card titles, inline heads.'],
          ['Body L', 18, 400, 'body', '0', 1.5, 'Lede copy, quotes.'],
          ['Body', 15, 400, 'body', '0', 1.55, 'Default reading size.'],
          ['Body S', 13, 400, 'body', '0', 1.5, 'Metadata, captions.'],
          ['Mono', 12, 500, 'mono', '0.08em', 1.5, 'Data, code, IDs, timestamps.'],
        ].map(([name, size, weight, family, tracking, lh, use]) => (
          <div className="scale-row" key={name}>
            <div className="scale-lbl">
              <span className="scale-name">{name}</span>
              <span className="scale-spec">{size}px · {weight} · {family}</span>
            </div>
            <div className="scale-sample" style={{
              fontFamily: family === 'display' ? active.display : family === 'mono' ? active.mono : active.body,
              fontSize: size, fontWeight: weight, letterSpacing: tracking, lineHeight: lh, color: colors.ink.hex,
              textTransform: family === 'mono' ? 'uppercase' : 'none',
            }}>
              {family === 'mono' ? 'FLEET-01 · RUNNING' : 'One brain, many bots.'}
            </div>
            <div className="scale-use">{use}</div>
          </div>
        ))}
      </div>

      <div className="sec-sub">Pairing rules</div>
      <div className="kpair"><span className="k">Display + Body</span><span className="v">Never use the display face below 22px. Never use body above 40px.</span></div>
      <div className="kpair"><span className="k">Mono</span><span className="v">Only for data, eyebrows, timestamps, identifiers. Never body copy.</span></div>
      <div className="kpair"><span className="k">Measure</span><span className="v">Keep line length 55–75 characters. Use <code>text-wrap: pretty</code>.</span></div>
      <div className="kpair"><span className="k">Numerals</span><span className="v">Tabular for tables and counters. Proportional for body.</span></div>
    </section>
  );
}

function S_Iconography({ t }) {
  const c = PALETTES[t.palette].tokens;
  const icons = [
    { label: 'Robot', path: 'M7 8h10v9H7zM9 5v3M15 5v3M10 12h1M13 12h1M5 12h2M17 12h2' },
    { label: 'Elevator', path: 'M5 3h14v18H5zM12 3v18M8 8l1.5-2L11 8M13 16l1.5 2L16 16' },
    { label: 'Signal', path: 'M3 20l6-8 5 5 7-10M20 7h-4M20 7v4' },
    { label: 'Shield', path: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z' },
    { label: 'Node', path: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0 -6 0M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5' },
    { label: 'Route', path: 'M5 5h6v6H5zM13 13h6v6h-6zM11 8h4v2h-2v3' },
    { label: 'Heart', path: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z' },
    { label: 'Building', path: 'M4 21V5l8-2 8 2v16M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2' },
  ];
  return (
    <section id="iconography" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>06</span> Iconography</div>
        <h2>Geometric line. 1.5px stroke. Round caps.</h2>
        <p className="lede">Icons are structural, not decorative. We don't draw little robots. Placeholder glyphs below; final set is produced once direction locks.</p>
      </div>

      <div className="icon-grid">
        {icons.map(ic => (
          <div className="icon-cell" key={ic.label}>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke={c.ink.hex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={ic.path}/>
            </svg>
            <span>{ic.label}</span>
          </div>
        ))}
      </div>

      <div className="sec-sub">Illustration direction</div>
      <div className="illo-grid">
        <div className="illo">
          <svg viewBox="0 0 200 120" width="100%">
            <rect x="10" y="30" width="180" height="80" rx="4" fill={c.paper2.hex}/>
            <rect x="10" y="30" width="180" height="8" fill={c.ink.hex} opacity=".15"/>
            <circle cx="60" cy="75" r="18" fill={c.primary.hex}/>
            <rect x="90" y="60" width="40" height="30" rx="3" fill="none" stroke={c.ink.hex} strokeWidth="1.5"/>
            <line x1="35" y1="110" x2="165" y2="110" stroke={c.ink.hex} strokeWidth="1"/>
            <line x1="40" y1="110" x2="40" y2="100" stroke={c.ink.hex} strokeWidth="1"/>
            <line x1="160" y1="110" x2="160" y2="100" stroke={c.ink.hex} strokeWidth="1"/>
          </svg>
          <div className="illo-lbl">Isometric building slices — show the robot in context. Restraint: flat fills + line accents, no rendered 3D.</div>
        </div>
        <div className="illo">
          <svg viewBox="0 0 200 120" width="100%">
            <circle cx="100" cy="60" r="8" fill={c.primary.hex}/>
            <circle cx="40" cy="30" r="4" fill={c.ink.hex}/>
            <circle cx="160" cy="30" r="4" fill={c.success.hex}/>
            <circle cx="30" cy="90" r="4" fill={c.ink.hex}/>
            <circle cx="170" cy="90" r="4" fill={c.ink.hex}/>
            <circle cx="100" cy="105" r="4" fill={c.success.hex}/>
            <line x1="100" y1="60" x2="40" y2="30" stroke={c.ink.hex} opacity=".4"/>
            <line x1="100" y1="60" x2="160" y2="30" stroke={c.ink.hex} opacity=".4"/>
            <line x1="100" y1="60" x2="30" y2="90" stroke={c.ink.hex} opacity=".4"/>
            <line x1="100" y1="60" x2="170" y2="90" stroke={c.ink.hex} opacity=".4"/>
            <line x1="100" y1="60" x2="100" y2="105" stroke={c.ink.hex} opacity=".4"/>
          </svg>
          <div className="illo-lbl">Node diagrams — the "brain" metaphor made literal. Use in pitch decks and systems slides.</div>
        </div>
        <div className="illo">
          <svg viewBox="0 0 200 120" width="100%">
            <rect x="20" y="20" width="160" height="80" rx="3" fill="none" stroke={c.ink.hex} strokeDasharray="2 3"/>
            <path d="M20 70 L60 50 L100 80 L140 40 L180 60" fill="none" stroke={c.primary.hex} strokeWidth="2"/>
            <circle cx="140" cy="40" r="3" fill={c.primary.hex}/>
          </svg>
          <div className="illo-lbl">Quiet data viz — thin strokes, single accent, grid on dashed. No gradients, no glow.</div>
        </div>
      </div>
    </section>
  );
}

function S_Photography({ t }) {
  return (
    <section id="photography" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>07</span> Photography</div>
        <h2>People and robots. In the same frame. Not fighting.</h2>
        <p className="lede">Every hero photo should answer: what is the person doing, and how is the robot helping? No empty hallways. No dystopian hospital stock.</p>
      </div>
      <div className="photo-grid">
        <div className="photo-card">
          <div className="photo-img" style={{aspectRatio: '4/5', backgroundImage: "url(https://images.unsplash.com/photo-1666214280557-f1b5022eb634?auto=format&fit=crop&w=800&q=70)"}}>
            <div className="photo-cap">
              <span className="photo-tag">Care-side</span>
              <small>Nurse + staff at bedside, natural light</small>
            </div>
          </div>
          <b>Do</b>
          <p>Natural light. Real environments. Staff in real scrubs and uniforms. Candid over posed. Warm, not clinical.</p>
        </div>
        <div className="photo-card">
          <div className="photo-img" style={{aspectRatio: '4/5', backgroundImage: "url(https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=800&q=70)"}}>
            <div className="photo-cap">
              <span className="photo-tag">Platform-side</span>
              <small>Ops coordinator with tablet, shallow depth</small>
            </div>
          </div>
          <b>Do</b>
          <p>Human foreground, robot soft in background. The software is the subject — the hardware is a supporting actor.</p>
        </div>
        <div className="photo-card">
          <div className="photo-img" style={{aspectRatio: '4/5', backgroundImage: "url(https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=70)"}}>
            <div className="photo-cap">
              <span className="photo-tag">Hospitality</span>
              <small>Hotel lobby — the setting robots slot into</small>
            </div>
          </div>
          <b>Do</b>
          <p>Show the robot in context — integrated into the space, not hero-lit in isolation. Architecture + people + machine.</p>
        </div>
        <div className="photo-card">
          <div className="photo-img" style={{aspectRatio: '4/5', backgroundImage: "url(https://images.unsplash.com/photo-1587302912306-cf1ed9c33146?auto=format&fit=crop&w=800&q=70)"}}>
            <div className="photo-cap">
              <span className="photo-tag">Operational</span>
              <small>Staff hallway check, active facility</small>
            </div>
          </div>
          <b>Do</b>
          <p>Document real work. Motion, uniforms, real light, real spaces. Never stage a stock-photo "tech moment."</p>
        </div>
        <div className="photo-card photo-dont">
          <div className="photo-img" style={{aspectRatio: '4/5', backgroundImage: "url(https://images.unsplash.com/photo-1535378620166-273708d44e4c?auto=format&fit=crop&w=800&q=70)", filter:'grayscale(.3) contrast(1.1)'}}>
            <div className="photo-cap">
              <span className="photo-tag" style={{background:'var(--danger)'}}>Avoid</span>
              <small>Humanoid hero shot, no humans</small>
            </div>
          </div>
          <b>Don't</b>
          <p>Dystopian sci-fi. Blue-tinted "tech" grades. Humanoid close-ups without human presence. Glowing eyes, lens flares.</p>
        </div>
        <div className="photo-card photo-dont">
          <div className="photo-img" style={{aspectRatio: '4/5', backgroundImage: "url(https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=70)", filter:'grayscale(.5) contrast(1.1)'}}>
            <div className="photo-cap">
              <span className="photo-tag" style={{background:'var(--danger)'}}>Avoid</span>
              <small>Abstract circuitry / AI slop</small>
            </div>
          </div>
          <b>Don't</b>
          <p>Abstract "AI" imagery — circuit boards, neural glows, stock robot silhouettes. Our story is people + real buildings.</p>
        </div>
      </div>
    </section>
  );
}

function S_Motion({ t }) {
  return (
    <section id="motion" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>08</span> Motion</div>
        <h2>Deliberate. Mechanical. Never bouncy.</h2>
      </div>
      <div className="motion-grid">
        <div className="motion-card">
          <div className="motion-demo"><div className="mo-dot mo-a"/></div>
          <b>Ease & duration</b>
          <div className="kpair"><span className="k">Micro</span><span className="v">120ms · ease-out · hovers, toggles</span></div>
          <div className="kpair"><span className="k">Standard</span><span className="v">240ms · cubic-bezier(.3,.7,.3,1) · page transitions, modals</span></div>
          <div className="kpair"><span className="k">Deliberate</span><span className="v">480ms · ease-in-out · hero reveals, scene changes</span></div>
        </div>
        <div className="motion-card">
          <div className="motion-demo"><div className="mo-route"><div className="mo-bot"/></div></div>
          <b>Signature motion</b>
          <p>The routing line — a robot moving along a path with purpose. Thin trailing stroke. Use for platform demos, nav indicators, hero loops.</p>
        </div>
        <div className="motion-card">
          <b>Don't</b>
          <ul>
            <li>Spring physics — no overshoot, no wobble. Robots don't wobble.</li>
            <li>Parallax layers on marketing pages.</li>
            <li>Auto-playing video with sound.</li>
            <li>Motion longer than 600ms on interface elements.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function S_UITokens({ t }) {
  const c = PALETTES[t.palette].tokens;
  return (
    <section id="ui-tokens" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>09</span> Product UI tokens</div>
        <h2>How the brand lives in the dashboard.</h2>
        <p className="lede">These map 1:1 to the Command Center. Changing the palette re-themes the product in the next release.</p>
      </div>

      <div className="tokens-grid">
        <div className="token-card">
          <div className="tc-hd">Spacing scale</div>
          {[4,8,12,16,24,32,48,64].map(n => (
            <div className="tc-row" key={n}>
              <span className="tc-lbl">{n}px</span>
              <span className="tc-bar" style={{width: n, background: c.ink.hex}}/>
            </div>
          ))}
        </div>
        <div className="token-card">
          <div className="tc-hd">Radii</div>
          {[
            ['xs', 4, 'Tags, inline chips'],
            ['sm', 8, 'Buttons, inputs'],
            ['md', 12, 'Cards'],
            ['lg', 16, 'Modals, sheets'],
            ['pill', 999, 'Status pills, avatars'],
          ].map(([k, r, u]) => (
            <div className="tc-row" key={k}>
              <span className="tc-lbl">{k}</span>
              <span className="tc-radius" style={{borderRadius: r, background: c.paper2.hex, borderColor: c.ink.hex}}/>
              <span className="tc-use">{u}</span>
            </div>
          ))}
        </div>
        <div className="token-card">
          <div className="tc-hd">Elevation</div>
          {[
            ['0', 'none', 'Flat surface'],
            ['1', '0 1px 2px rgba(14,20,32,.06)', 'Cards at rest'],
            ['2', '0 8px 24px -8px rgba(14,20,32,.15)', 'Cards on hover, popovers'],
            ['3', '0 24px 48px -16px rgba(14,20,32,.25)', 'Modals, command bar'],
          ].map(([k, s, u]) => (
            <div className="tc-row" key={k}>
              <span className="tc-lbl">elev-{k}</span>
              <span className="tc-shadow" style={{boxShadow: s, background: c.paper.hex}}/>
              <span className="tc-use">{u}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sec-sub">Components</div>
      <div className="comp-grid">
        <div className="comp">
          <button style={{background: c.primary.hex, color:'#fff', border:'none', padding:'10px 16px', borderRadius: 8, font: '500 14px Inter', cursor:'default'}}>Dispatch fleet</button>
          <button style={{background: c.ink.hex, color: c.paper.hex, border:'none', padding:'10px 16px', borderRadius: 8, font: '500 14px Inter', cursor:'default', marginLeft: 8}}>View logs</button>
          <button style={{background: 'transparent', color: c.ink.hex, border:`1px solid ${c.ink.hex}33`, padding:'10px 16px', borderRadius: 8, font: '500 14px Inter', cursor:'default', marginLeft: 8}}>Cancel</button>
          <div className="comp-lbl">Buttons — Primary · Secondary · Tertiary</div>
        </div>
        <div className="comp">
          <span className="status-pill" style={{background: c.success.hex + '22', color: c.success.hex}}>● Running</span>
          <span className="status-pill" style={{background: c.warning.hex + '22', color: c.warning.hex}}>● Pending</span>
          <span className="status-pill" style={{background: c.danger.hex + '22', color: c.danger.hex}}>● Fault</span>
          <span className="status-pill" style={{background: c.ink.hex + '11', color: c.ink2.hex}}>● Offline</span>
          <div className="comp-lbl">Status pills</div>
        </div>
        <div className="comp">
          <div className="mini-card" style={{background:'#fff', border:`1px solid ${c.ink.hex}15`, color: c.ink.hex}}>
            <div style={{fontFamily:'JetBrains Mono', fontSize: 10, color: c.ink2.hex, letterSpacing:'.1em'}}>FLEET-01 · LOBBY</div>
            <div style={{fontFamily:'var(--font-display)', fontSize: 22, marginTop: 4}}>12 robots online</div>
            <div style={{fontSize: 12, color: c.ink2.hex, marginTop: 2}}>2 charging · 1 maintenance</div>
          </div>
          <div className="comp-lbl">Data card</div>
        </div>
      </div>
    </section>
  );
}

function S_CoBranding({ t }) {
  const c = PALETTES[t.palette].tokens;
  const partners = ['KEENON', 'NVIDIA', 'KONE', 'TOYOTA', 'PUDU', 'AVIDBOTS', 'AETHON'];
  return (
    <section id="co-branding" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>10</span> Co-branding</div>
        <h2>We integrate everyone. We don't dress like everyone.</h2>
        <p className="lede">Partner logos appear in three contexts: ecosystem walls, co-marketed case studies, integration announcements. Each has rules.</p>
      </div>

      <div className="cob-grid">
        <div className="cob">
          <div className="cob-hd">Atlas lockup</div>
          <div className="cob-stage">
            <div style={{fontFamily:'var(--font-display)', fontSize: 22, color: c.ink.hex}}>Accelerate Robotics</div>
            <div className="cob-div"/>
            <div style={{fontFamily: 'var(--font-body)', fontSize: 12, color: c.ink2.hex, letterSpacing: '.08em', textTransform:'uppercase'}}>a venture of Atlas Mobility</div>
          </div>
          <p>Use on founder communications, official venture announcements, and contexts where the Atlas connection builds trust.</p>
        </div>
        <div className="cob">
          <div className="cob-hd">Partner wall</div>
          <div className="cob-stage cob-partners">
            {partners.map(p => <div className="p-chip" key={p}>{p}</div>)}
          </div>
          <p>Mono, equal weight, alphabetical. Never rank. Our logo never appears in the wall — we're the platform they're on.</p>
        </div>
        <div className="cob">
          <div className="cob-hd">Case study / integration</div>
          <div className="cob-stage cob-pair">
            <span style={{fontFamily:'var(--font-display)', fontSize: 18, color: c.ink.hex}}>Accelerate</span>
            <span style={{color: c.ink2.hex, fontSize: 22}}>×</span>
            <span style={{fontFamily:'var(--font-body)', fontWeight: 700, fontSize: 16, color: c.ink.hex}}>KEENON</span>
          </div>
          <p>Equal visual weight, our name first. Minimum clear space between marks equals the partner logo height.</p>
        </div>
      </div>
    </section>
  );
}

function S_Applications({ t }) {
  const c = PALETTES[t.palette].tokens;
  const { Component: Logo } = LOGO_REGISTRY[t.logoDirection];
  return (
    <section id="applications" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>11</span> Applications</div>
        <h2>The brand, in the wild.</h2>
        <p className="lede">Sketches, not finals. Every tile below re-renders as you tweak color, logo, and type.</p>
      </div>

      <div className="apps-grid">
        {/* Pitch deck cover */}
        <div className="app">
          <div className="app-lbl">Pitch deck · Cover</div>
          <div className="app-stage" style={{background: c.ink.hex, color: c.paper.hex, aspectRatio: '16/9', padding: '24px'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontFamily:'JetBrains Mono', fontSize:9, letterSpacing:'.1em', color:c.paper.hex+'aa'}}>
              <span>SERIES SEED · 2026</span>
              <span>01 / 24</span>
            </div>
            <div style={{marginTop:'auto'}}>
              <div style={{fontFamily:'var(--font-display)', fontSize: 34, lineHeight:1, color:c.paper.hex}}>One brain.<br/><em style={{color:c.primary.hex,fontStyle:'italic'}}>Many bots.</em></div>
              <div style={{fontFamily:'var(--font-body)', fontSize: 10, color: c.paper.hex+'99', marginTop:12, maxWidth:'60%'}}>The operating system for facility robotics.</div>
            </div>
          </div>
        </div>

        {/* 1-pager */}
        <div className="app">
          <div className="app-lbl">Sales 1-pager</div>
          <div className="app-stage" style={{background: c.paper.hex, aspectRatio: '3/4', padding: 16, color: c.ink.hex}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
              <div style={{transform:'scale(.55)', transformOrigin:'top left'}}>
                <Logo color={c.primary.hex} accent={c.success.hex} ink={c.ink.hex}/>
              </div>
              <span style={{fontFamily:'JetBrains Mono', fontSize:8, letterSpacing:'.1em'}}>FOR HOTELS · CARE · HEALTHCARE</span>
            </div>
            <div style={{fontFamily:'var(--font-display)', fontSize: 22, lineHeight:1.05, marginTop: 8}}>Every robot in your building, working as one.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:14}}>
              <div style={{background:c.paper2.hex,padding:10,borderRadius:6}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:22,color:c.primary.hex}}>77%</div>
                <div style={{fontSize:9,color:c.ink2.hex}}>HAPI reduction (Atlas)</div>
              </div>
              <div style={{background:c.paper2.hex,padding:10,borderRadius:6}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:22,color:c.primary.hex}}>5 OEMs</div>
                <div style={{fontSize:9,color:c.ink2.hex}}>Elevator protocols unified</div>
              </div>
            </div>
            <div style={{marginTop:14,fontSize:9,lineHeight:1.5,color:c.ink2.hex}}>Universal robot API · Human ops layer · Compliance per vertical · One platform, every vendor.</div>
          </div>
        </div>

        {/* Social */}
        <div className="app">
          <div className="app-lbl">Social announcement</div>
          <div className="app-stage" style={{background: c.primary.hex, aspectRatio:'1/1', padding: 20, color: c.paper.hex, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
            <span style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:'.15em'}}>NEWS · SERIES SEED</span>
            <div style={{fontFamily:'var(--font-display)',fontSize:28,lineHeight:1,letterSpacing:'-0.01em'}}>We're building the OS for facility robotics.</div>
            <div style={{fontFamily:'var(--font-body)',fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>accelerate robotics · miami</div>
          </div>
        </div>

        {/* Business card */}
        <div className="app">
          <div className="app-lbl">Business card</div>
          <div className="app-stage" style={{background: c.paper.hex, aspectRatio:'1.75/1', padding:14, color:c.ink.hex, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
            <div style={{transform:'scale(.6)', transformOrigin:'top left'}}>
              <Logo color={c.primary.hex} accent={c.success.hex} ink={c.ink.hex}/>
            </div>
            <div>
              <div style={{fontFamily:'var(--font-display)',fontSize:16}}>Eric Race</div>
              <div style={{fontSize:9,color:c.ink2.hex,marginTop:2,fontFamily:'JetBrains Mono',letterSpacing:'.06em'}}>FOUNDER · erace@atlasmobility.com</div>
            </div>
          </div>
        </div>

        {/* Swag — tote */}
        <div className="app">
          <div className="app-lbl">Swag · tote</div>
          <div className="app-stage" style={{background: c.paper2.hex, aspectRatio:'1/1', padding:0, position:'relative', overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,background: c.ink.hex, margin:'18% 18% 8%', borderRadius:'2px 2px 0 0'}}/>
            <div style={{position:'absolute',top:'8%',left:'30%',width:'12%',height:'20%',border:`2px solid ${c.ink.hex}`,borderBottom:'none',borderRadius:'40px 40px 0 0'}}/>
            <div style={{position:'absolute',top:'8%',right:'30%',width:'12%',height:'20%',border:`2px solid ${c.ink.hex}`,borderBottom:'none',borderRadius:'40px 40px 0 0'}}/>
            <div style={{position:'absolute',inset:'35% 20% 20%',color:c.paper.hex,fontFamily:'var(--font-display)',fontSize:26,fontStyle:'italic',lineHeight:1}}>
              one brain.<br/><span style={{color:c.primary.hex}}>many bots.</span>
            </div>
          </div>
        </div>

        {/* Signage */}
        <div className="app">
          <div className="app-lbl">Facility signage</div>
          <div className="app-stage" style={{background: c.ink.hex, aspectRatio:'3/2', padding:18, color:c.paper.hex, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:'.15em',color:c.paper.hex+'99'}}>ROBOT CHARGING BAY · 03</div>
            <div>
              <div style={{fontFamily:'var(--font-display)',fontSize:28,lineHeight:1}}>Do not block.</div>
              <div style={{fontSize:10,color:c.paper.hex+'aa',marginTop:6}}>Active robot traffic. Ask an Ops Coordinator for assistance.</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:c.success.hex}}/>
              <span style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:'.1em'}}>FLEET ONLINE</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function S_DoDont({ t }) {
  return (
    <section id="do-dont" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>12</span> Do & Don't</div>
        <h2>The short list.</h2>
      </div>
      <div className="dd-grid">
        {[
          ['Put humans in the frame.', 'Draw empty robot corridors.', true],
          ['Lead with outcomes (HAPI↓, injury↓).', 'Lead with features.', true],
          ['Treat partners as peers.', 'Rank logos by deal size.', true],
          ['Use one accent per screen.', 'Rainbow the palette.', true],
          ['Let the serif breathe at display size.', 'Use serif below 22px.', true],
          ['Say "supports the workforce."', 'Say "replaces the workforce."', true],
        ].map(([d, dn], i) => (
          <div className="dd-row" key={i}>
            <div className="dd-do">✓ {d}</div>
            <div className="dd-dnt">✕ {dn}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function S_Governance({ t }) {
  return (
    <section id="governance" className="sec">
      <div className="sec-hd">
        <div className="eyebrow"><span>13</span> Governance</div>
        <h2>How this doc stays alive.</h2>
      </div>
      <div className="grid grid-3">
        <div className="gov">
          <div className="gov-num">01</div>
          <b>Every token is tweakable.</b>
          <p>Open Tweaks in the toolbar. Change a color, swap a logo, switch the type pair. The change persists to disk.</p>
        </div>
        <div className="gov">
          <div className="gov-num">02</div>
          <b>Propose changes here, not in email.</b>
          <p>When a decision lands (e.g. "we're going with Aurora"), set it in Tweaks + drop a one-liner below that section.</p>
        </div>
        <div className="gov">
          <div className="gov-num">03</div>
          <b>Review cadence: quarterly.</b>
          <p>Draft 01 (this). Draft 02 locks color + logo. v1.0 ships alongside brand launch and feeds external designers.</p>
        </div>
      </div>
      <div className="sign">
        <div>
          <div style={{fontFamily:'var(--font-display)', fontSize: 24}}>— The end, for now.</div>
          <div style={{fontSize: 13, color: 'var(--ink-2)', marginTop: 8}}>Draft 01 · Living document · Owner: Eric Race</div>
        </div>
      </div>
    </section>
  );
}

// Export globals
Object.assign(window, {
  LOGO_REGISTRY, PALETTES,
  S_Foundation, S_Voice, S_Logo, S_Color, S_Typography,
  S_Iconography, S_Photography, S_Motion, S_UITokens,
  S_CoBranding, S_Applications, S_DoDont, S_Governance,
});
