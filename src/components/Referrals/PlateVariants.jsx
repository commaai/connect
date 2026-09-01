import React from 'react';

// Preview page for picking a license plate style, served at /referrals-variants.

const CODE = 'ABC1234';

const variants = [
  {
    name: '1 · chrome frame + charcoal',
    frame: 'rounded-[19px] bg-gradient-to-b from-white/55 via-white/20 to-white/5 p-[3px] shadow-[0_22px_45px_-20px_rgba(0,0,0,0.95)]',
    face: 'rounded-[16px] bg-gradient-to-b from-[#2b2e2c] via-[#191c1b] to-[#0d0f0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-4px_10px_rgba(0,0,0,0.6)]',
    rim: 'border-white/20',
    top: 'text-white/50',
    code: 'text-[#f4f6f4] [text-shadow:0_-1px_0_rgba(255,255,255,0.35),0_2px_3px_rgba(0,0,0,0.8)]',
    bottom: 'text-white/40',
    bolt: 'bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.18)]',
  },
  {
    name: '2 · frameless, hairline rim',
    frame: 'rounded-[14px] p-0 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]',
    face: 'rounded-[14px] bg-gradient-to-b from-[#33383a] via-[#1a1e20] to-[#0a0c0d] ring-1 ring-white/25 shadow-[inset_0_2px_0_rgba(255,255,255,0.22),inset_0_-6px_14px_rgba(0,0,0,0.7)]',
    rim: 'border-white/15',
    top: 'text-white/45',
    code: 'text-white [text-shadow:0_-1px_0_rgba(255,255,255,0.4),0_3px_4px_rgba(0,0,0,0.85)]',
    bottom: 'text-white/35',
    bolt: 'bg-black/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.15)]',
  },
  {
    name: '3 · brushed metal',
    frame: 'rounded-[18px] bg-gradient-to-b from-white/45 to-white/5 p-[2px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]',
    face: 'rounded-[16px] bg-[linear-gradient(180deg,#3a3f40_0%,#212527_55%,#101314_100%),repeating-linear-gradient(90deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_3px)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-4px_12px_rgba(0,0,0,0.65)]',
    rim: 'border-white/20',
    top: 'text-white/50',
    code: 'text-[#eef1f2] [text-shadow:0_-1px_0_rgba(255,255,255,0.35),0_2px_3px_rgba(0,0,0,0.8)]',
    bottom: 'text-white/40',
    bolt: 'bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.2)]',
  },
  {
    name: '4 · midnight blue',
    frame: 'rounded-[19px] bg-gradient-to-b from-white/40 via-white/15 to-white/5 p-[3px] shadow-[0_22px_45px_-20px_rgba(0,0,0,0.95)]',
    face: 'rounded-[16px] bg-gradient-to-b from-[#24303d] via-[#141c26] to-[#080c11] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-4px_12px_rgba(0,0,0,0.7)]',
    rim: 'border-white/25',
    top: 'text-white/55',
    code: 'text-[#f2f6fa] [text-shadow:0_-1px_0_rgba(255,255,255,0.35),0_2px_4px_rgba(0,0,0,0.85)]',
    bottom: 'text-white/40',
    bolt: 'bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.2)]',
  },
  {
    name: '7 · two-tone header band',
    frame: 'rounded-[18px] bg-gradient-to-b from-white/45 to-white/5 p-[2.5px] shadow-[0_20px_42px_-20px_rgba(0,0,0,0.95)]',
    face: 'rounded-[15px] bg-gradient-to-b from-[#3c4143] via-[#3c4143] to-[#101314] bg-[length:100%_100%] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-4px_12px_rgba(0,0,0,0.65)]',
    faceStyle: { backgroundImage: 'linear-gradient(180deg,#33393b 0%,#33393b 26%,#191d1f 27%,#0c0f10 100%)' },
    rim: 'border-white/15',
    top: 'text-white/70',
    code: 'text-[#f4f6f4] [text-shadow:0_-1px_0_rgba(255,255,255,0.3),0_2px_3px_rgba(0,0,0,0.8)]',
    bottom: 'text-white/35',
    bolt: 'bg-black/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.2)]',
  },
  {
    name: '8 · stamped / debossed',
    frame: 'rounded-[19px] bg-gradient-to-b from-white/40 to-white/5 p-[3px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]',
    face: 'rounded-[16px] bg-gradient-to-b from-[#585d5f] via-[#3a3f41] to-[#22282a] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-4px_12px_rgba(0,0,0,0.5)]',
    rim: 'border-white/20',
    top: 'text-white/55',
    code: 'text-[#f4f6f4] [text-shadow:0_-1px_0_rgba(255,255,255,0.3),0_2px_3px_rgba(0,0,0,0.55)]',
    bottom: 'text-white/40',
    bolt: 'bg-black/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.7),0_1px_0_rgba(255,255,255,0.3)]',
  },
  {
    name: '9 · carbon + halo',
    frame: 'rounded-[19px] bg-gradient-to-b from-white/30 to-white/5 p-[2px] shadow-[0_0_40px_-6px_rgba(255,255,255,0.18),0_20px_40px_-20px_rgba(0,0,0,0.95)]',
    face: 'rounded-[17px] bg-gradient-to-b from-[#1e2123] via-[#141617] to-[#000000] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-6px_16px_rgba(0,0,0,0.8)]',
    rim: 'border-white/12',
    top: 'text-white/45',
    code: 'text-white [text-shadow:0_-1px_0_rgba(255,255,255,0.3),0_2px_10px_rgba(255,255,255,0.15)]',
    bottom: 'text-white/35',
    bolt: 'bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.15)]',
  },
  {
    name: '10 · classic white plate',
    frame: 'rounded-[19px] bg-gradient-to-b from-white/70 via-white/25 to-white/10 p-[3px] shadow-[0_20px_45px_-20px_rgba(0,0,0,0.95)]',
    face: 'rounded-[16px] bg-gradient-to-b from-[#fcfdfc] via-[#eef1ee] to-[#d6dbd7] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-3px_8px_rgba(0,0,0,0.16)]',
    rim: 'border-[#16181a]/15',
    top: 'text-[#16181a]/45',
    code: 'text-[#17293d] [text-shadow:0_-1px_0_rgba(255,255,255,0.9),0_2px_2px_rgba(0,0,0,0.3)]',
    bottom: 'text-[#16181a]/40',
    bolt: 'bg-[#16181a]/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.8)]',
  },
];


const DARK_FACE = {
  frame: 'rounded-[19px] bg-gradient-to-b from-white/55 via-white/20 to-white/5 p-[3px] shadow-[0_22px_45px_-20px_rgba(0,0,0,0.95)]',
  face: 'rounded-[16px] bg-gradient-to-b from-[#2b2e2c] via-[#191c1b] to-[#0d0f0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-4px_10px_rgba(0,0,0,0.6)]',
  rim: 'border-white/20',
  top: 'text-white/50',
  bottom: 'text-white/40',
  bolt: 'bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.18)]',
};

const EMBOSS_FACE = {
  frame: 'rounded-[19px] bg-gradient-to-b from-white/50 via-white/15 to-black/40 p-[3px] shadow-[0_26px_50px_-22px_rgba(0,0,0,1)]',
  face: 'rounded-[16px] bg-gradient-to-b from-[#4a4f51] via-[#23282a] to-[#0b0e0f] shadow-[inset_0_3px_0_rgba(255,255,255,0.3),inset_0_-10px_22px_rgba(0,0,0,0.8)]',
  rim: 'border-white/20',
  top: 'text-white/55',
  bottom: 'text-white/40',
  bolt: 'bg-black/70 shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.25)]',
};

const FRAMELESS_FACE = {
  frame: 'rounded-[14px] p-0 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]',
  face: 'rounded-[14px] bg-gradient-to-b from-[#33383a] via-[#1a1e20] to-[#0a0c0d] ring-1 ring-white/25 shadow-[inset_0_2px_0_rgba(255,255,255,0.22),inset_0_-6px_14px_rgba(0,0,0,0.7)]',
  rim: 'border-white/15',
  top: 'text-white/45',
  bottom: 'text-white/35',
  bolt: 'bg-black/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.15)]',
};

const MIDNIGHT_FACE = {
  frame: 'rounded-[19px] bg-gradient-to-b from-white/40 via-white/15 to-white/5 p-[3px] shadow-[0_22px_45px_-20px_rgba(0,0,0,0.95)]',
  face: 'rounded-[16px] bg-gradient-to-b from-[#24303d] via-[#141c26] to-[#080c11] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-4px_12px_rgba(0,0,0,0.7)]',
  rim: 'border-white/25',
  top: 'text-white/55',
  bottom: 'text-white/40',
  bolt: 'bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.2)]',
};

const CARBON_FACE = {
  frame: 'rounded-[19px] bg-gradient-to-b from-white/30 to-white/5 p-[2px] shadow-[0_0_40px_-6px_rgba(255,255,255,0.18),0_20px_40px_-20px_rgba(0,0,0,0.95)]',
  face: 'rounded-[17px] bg-gradient-to-b from-[#1e2123] via-[#141617] to-[#000000] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-6px_16px_rgba(0,0,0,0.8)]',
  rim: 'border-white/12',
  top: 'text-white/45',
  bottom: 'text-white/35',
  bolt: 'bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.15)]',
};

// The background box is taller than the glyphs, so stops given in glyph space
// (0 = cap height, 1 = baseline) are remapped into the line box before use.
const GLYPH_TOP = 22;
const GLYPH_BOTTOM = 87;

function gradientText(stops, textShadow) {
  const image = `linear-gradient(180deg,${stops
    .map(([color, at]) => `${color} ${(GLYPH_TOP + (at * (GLYPH_BOTTOM - GLYPH_TOP))).toFixed(1)}%`)
    .join(',')})`;
  return {
    backgroundImage: image,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    textShadow,
  };
}

const gradientVariants = [
  {
    ...DARK_FACE,
    name: '15 · warm off-white fade',
    codeStyle: gradientText([['#fffdf8', 0], ['#e8e2d6', 0.55], ['#b6b0a4', 1]], '0 2px 3px rgba(0,0,0,0.8)'),
  },
  {
    ...EMBOSS_FACE,
    name: '16 · deep emboss + gradient text',
    codeStyle: gradientText([['#ffffff', 0], ['#ffffff', 0.4], ['#98a0a4', 1]], '0 -1px 0 rgba(255,255,255,0.35),0 3px 5px rgba(0,0,0,0.9)'),
  },
  {
    ...FRAMELESS_FACE,
    name: '17 · frameless + chrome text',
    codeStyle: gradientText([['#ffffff', 0], ['#e2e7e9', 0.48], ['#98a1a5', 0.52], ['#f4f7f8', 1]], '0 3px 4px rgba(0,0,0,0.85)'),
  },
  {
    ...MIDNIGHT_FACE,
    name: '18 · midnight + cool gradient text',
    codeStyle: gradientText([['#ffffff', 0], ['#dbe6f0', 0.45], ['#8fa2b5', 1]], '0 2px 4px rgba(0,0,0,0.85)'),
  },
  {
    ...CARBON_FACE,
    name: '19 · carbon + fading text',
    codeStyle: gradientText([['#ffffff', 0], ['#c9ced1', 0.6], ['#6f7679', 1]], '0 2px 10px rgba(255,255,255,0.12)'),
  },
  {
    ...DARK_FACE,
    name: '20 · subtle, barely-there fade',
    codeStyle: gradientText([['#fbfcfc', 0], ['#d7dcde', 1]], '0 -1px 0 rgba(255,255,255,0.3),0 2px 3px rgba(0,0,0,0.8)'),
  },
];

const blueVariants = [
  {
    ...DARK_FACE,
    name: '21 · flat: pale blue-white',
    code: 'text-[#e6edf7] [text-shadow:0_-1px_0_rgba(255,255,255,0.3),0_2px_3px_rgba(0,0,0,0.8)]',
  },
  {
    ...DARK_FACE,
    name: '22 · flat: stronger ice blue',
    code: 'text-[#cfdcef] [text-shadow:0_-1px_0_rgba(255,255,255,0.28),0_2px_3px_rgba(0,0,0,0.8)]',
  },
  {
    ...DARK_FACE,
    name: '23 · flat: steel blue',
    code: 'text-[#b3c4db] [text-shadow:0_-1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.8)]',
  },
  {
    ...MIDNIGHT_FACE,
    name: '24 · flat: ice blue on midnight face',
    code: 'text-[#e2ebf7] [text-shadow:0_-1px_0_rgba(255,255,255,0.3),0_2px_4px_rgba(0,0,0,0.85)]',
  },
];

// comma.ai website accent: #51ff00 (hover #51b124).
const greenVariants = [
  {
    ...DARK_FACE,
    name: '29 · flat: barely-green off-white',
    code: 'text-[#eaf6e4] [text-shadow:0_-1px_0_rgba(255,255,255,0.3),0_2px_3px_rgba(0,0,0,0.8)]',
  },
  {
    ...CARBON_FACE,
    name: '33 · loud accent + green glow',
    code: 'text-[#51ff00] [text-shadow:0_0_18px_rgba(81,255,0,0.35),0_2px_4px_rgba(0,0,0,0.9)]',
  },
];

const eightVariants = [
  {
    name: '40 · 8 with lighter grey text',
    frame: 'rounded-[19px] bg-gradient-to-b from-white/40 to-white/5 p-[3px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]',
    face: 'rounded-[16px] bg-gradient-to-b from-[#585d5f] via-[#3a3f41] to-[#22282a] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-4px_12px_rgba(0,0,0,0.5)]',
    rim: 'border-white/20',
    top: 'text-white/50',
    code: 'text-[#c9ced1] [text-shadow:0_-1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.55)]',
    bottom: 'text-white/40',
    bolt: 'bg-black/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.7),0_1px_0_rgba(255,255,255,0.3)]',
  },
];

export default function PlateVariants() {
  return (
    <main className="mx-auto mb-8 w-[calc(100%-40px)] max-w-[430px] min-[521px]:w-[calc(100%-48px)] min-[1081px]:mx-6 text-white">
      <h1 className="my-8 text-3xl font-bold leading-none tracking-[-0.045em]">Plate variants</h1>
      <div className="space-y-7">
      {[...variants, ...gradientVariants, ...blueVariants, ...greenVariants, ...eightVariants].map((variant) => (
        <div key={variant.name}>
          <p className="mb-2 text-center text-[11px] uppercase tracking-[0.2em] text-white/40">{variant.name}</p>
          <div className={`relative mx-auto w-full max-w-[330px] transition ${variant.frame}`}>
            <div className={`relative overflow-hidden px-5 pb-3 pt-2.5 ${variant.face}`} style={variant.faceStyle}>
              <div aria-hidden="true" className={`pointer-events-none absolute inset-[7px] rounded-[10px] border ${variant.rim}`} />
              <span aria-hidden="true" className={`absolute left-[23%] top-2.5 h-[9px] w-[9px] rounded-full ${variant.bolt}`} />
              <span aria-hidden="true" className={`absolute right-[23%] top-2.5 h-[9px] w-[9px] rounded-full ${variant.bolt}`} />
              <p className={`relative text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.3em] ${variant.top}`}>
                comma.ai
              </p>
              <p
                className={`relative mt-0.5 text-center text-[clamp(2rem,11.5vw,3.25rem)] font-black uppercase leading-[1.1] tracking-[0.06em] ${variant.code || ''}`}
                style={variant.codeStyle}
              >
                {CODE}
              </p>
              <p className={`relative mt-0.5 text-center text-[9px] font-semibold uppercase leading-4 tracking-[0.28em] ${variant.bottom}`}>
                referral code
              </p>
            </div>
          </div>
        </div>
        ))}
      </div>
    </main>
  );
}
