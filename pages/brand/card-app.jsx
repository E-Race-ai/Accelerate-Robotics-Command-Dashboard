/* global React, ReactDOM, TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakColor, TweakText, TweakButton */

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "name": "Eric Race",
  "role": "Founder & Chief Executive",
  "phone": "+1 (925) 787-5517",
  "email": "erace@acceleraterobotics.ai",
  "city": "Miami, Florida",
  "frontVariant": "paper",
  "backVariant": "paper",
  "accent": "#FF6A3D",
  "wordmark": "ACCELERATE ROBOTICS",
  "wordmarkSerif": "Accelerate Robotics",
  "domain": "acceleraterobotics.ai",
  "poweredBy": "Atlas Mobility"
}/*EDITMODE-END*/;

function Field({ value, onChange, ...rest }) {
  return (
    <input
      className={"field " + (rest.className || "")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

function CardFront({ t, setTweak, variant }) {
  const isInk = variant === "ink";
  const inkColor = isInk ? "#F4F0E8" : "#1A1814";
  return (
    <div className={"card " + (isInk ? "--ink" : "")}>
      {/* Subtle nested chevron watermark */}
      <svg className="front-watermark" viewBox="0 0 64 56" aria-hidden="true" style={{overflow:'visible'}}>
        {/* Outer ink chevron — lower stroke extended past the card edge, parallel to the inner */}
        <path d="M 38 6 L 14 28 L 90 97.7" fill="none" stroke={inkColor} strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" />
        {/* Inner accent chevron */}
        <path d="M 56 6 L 32 28 L 56 50" fill="none" stroke={t.accent} strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" />
      </svg>
      <div className="front">
        {/* Middle: name + role */}
        <div className="person">
          <h2 className="name">
            <Field value={t.name} onChange={(v) => setTweak("name", v)} placeholder="Full Name" />
          </h2>
          <div className="role">
            <Field value={t.role} onChange={(v) => setTweak("role", v)} placeholder="Role" />
          </div>
        </div>

        {/* Bottom: contact, hairline-separated */}
        <div className="contact">
          <span className="lbl">Mobile</span>
          <span className="val">
            <Field value={t.phone} onChange={(v) => setTweak("phone", v)} />
          </span>
          <span className="lbl">Email</span>
          <span className="val">
            <Field value={t.email} onChange={(v) => setTweak("email", v)} />
          </span>
        </div>
      </div>
    </div>
  );
}

function CardBack({ t, setTweak, variant }) {
  const isInk = variant === "ink";
  const inkColor = isInk ? "#F4F0E8" : "#1A1814";
  return (
    <div className={"card " + (isInk ? "--ink" : "")}>
      <div className="back">
        <div className="back-center">
          <div className="lockup">
            <svg className="chev-mark" viewBox="0 0 64 56" aria-hidden="true">
              {/* Outer chevron (ink) */}
              <path d="M 38 6 L 14 28 L 38 50" fill="none" stroke={inkColor} strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" />
              {/* Inner chevron (accent) */}
              <path d="M 56 6 L 32 28 L 56 50" fill="none" stroke={t.accent} strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" />
            </svg>
            <div className="lockup-text">
              <div className="lockup-name">{t.wordmarkSerif}</div>
              <div className="lockup-sub">Powered by {t.poweredBy}</div>
            </div>
          </div>
        </div>

        <div className="back-foot">
          <span>{t.domain}</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.body.classList.add("edit-mode");
  }, []);

  const print = () => window.print();

  return (
    <>
      <div className="workspace">
        <div className="workspace-header">
          <div>
            <h1><span className="accent">›››</span> Accelerate Robotics — Business Card</h1>
            <p>3.5 × 2 in · standard US business card · click any field to edit</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={print}>Print card</button>
          </div>
        </div>

        <div className="stage">
          <div className="card-wrap">
            <CardFront t={t} setTweak={setTweak} variant={t.frontVariant} />
            <span className="card-label">Front</span>
            <span className="crop-marks"><span className="tr"></span><span className="bl"></span><span className="br"></span></span>
          </div>
          <div className="card-wrap">
            <CardBack t={t} setTweak={setTweak} variant={t.backVariant} />
            <span className="card-label">Back</span>
            <span className="crop-marks"><span className="tr"></span><span className="bl"></span><span className="br"></span></span>
          </div>
        </div>

        <p className="hint">
          Edit name, role, phone, and email directly on the front. Use the Tweaks panel for colorway and the back side wordmark.
        </p>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Person">
          <TweakText label="Name" value={t.name} onChange={(v) => setTweak("name", v)} />
          <TweakText label="Role" value={t.role} onChange={(v) => setTweak("role", v)} />
          <TweakText label="Mobile" value={t.phone} onChange={(v) => setTweak("phone", v)} />
          <TweakText label="Email" value={t.email} onChange={(v) => setTweak("email", v)} />
          <TweakText label="City" value={t.city} onChange={(v) => setTweak("city", v)} />
        </TweakSection>

        <TweakSection label="Card style">
          <TweakRadio
            label="Front"
            value={t.frontVariant}
            options={["paper", "ink"]}
            onChange={(v) => setTweak("frontVariant", v)}
          />
          <TweakRadio
            label="Back"
            value={t.backVariant}
            options={["paper", "ink"]}
            onChange={(v) => setTweak("backVariant", v)}
          />
          <TweakColor
            label="Accent"
            value={t.accent}
            onChange={(v) => setTweak("accent", v)}
          />
        </TweakSection>

        <TweakSection label="Brand">
          <TweakText label="Wordmark (front)" value={t.wordmark} onChange={(v) => setTweak("wordmark", v)} />
          <TweakText label="Wordmark (back, serif)" value={t.wordmarkSerif} onChange={(v) => setTweak("wordmarkSerif", v)} />
          <TweakText label="Domain" value={t.domain} onChange={(v) => setTweak("domain", v)} />
          <TweakText label="Powered by" value={t.poweredBy} onChange={(v) => setTweak("poweredBy", v)} />
        </TweakSection>

        <TweakSection label="Print">
          <TweakButton label="Print card" onClick={print} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
