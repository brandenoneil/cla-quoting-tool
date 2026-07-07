'use client'

import type { Quote } from '@prisma/client'
import type { LineItem } from '@/types'
import { canonicalLaserSource } from '@/lib/machineConstraints'
import { formatSizeInFeet } from '@/lib/priceCheckCatalog'

interface Props {
  quote: Quote
  isPdf?: boolean
}

// ── Brand palette ─────────────────────────────────────────────────────────────
const C = {
  crimson:   '#C0392B',
  navy:      '#1B1B2F',
  darkGray:  '#333333',
  midGray:   '#555555',
  lightGray: '#888888',
  rule:      '#DDDDDD',
  pageBg:    '#E8E8E8',
  white:     '#FFFFFF',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US') + '.00'
}
function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
function expiryDate(d: Date | string) {
  const base = new Date(d)
  base.setDate(base.getDate() + 30)
  return formatDate(base)
}

// ── Machine content helpers ───────────────────────────────────────────────────
// Cutting areas cross-referenced from official brochures
const CUTTING_AREAS: Record<string, string> = {
  // FAST / XME / XMF shared sizes
  '3015': "10' × 5'",
  '4015': "13' × 5'",
  '4020': "13.3' × 6.7'",
  '4525': "14.9' × 8.4'",
  '6020': "20' × 6.7'",
  '6025': "20' × 8.4'",
  '6225': "20.4' × 8.4'",   // XME max
  // Plus Bevel / Plus Evo / Fiber HD shared sizes
  '6525': "21.5' × 8.4'",
  '6530': "21.5' × 10'",
  '6537': "21.5' × 12.3'",
  '6030': "20' × 10'",
  '7035': "23.1' × 11.6'",
  '7037': "23.1' × 12.3'",
  '7530': "24.8' × 10'",
  '8020': "26.4' × 6.7'",
  '8025': "26.4' × 8.4'",
  '8030': "26.4' × 10'",
  '9030': "29.9' × 10'",
  '9037': "29.9' × 12.3'",
  '12025': "40' × 8.4'",
  '12030': "40.5' × 10'",
  '12037': "40.5' × 12.3'",
  '13030': "43.1' × 10'",
  '13037': "43.1' × 12.3'",
  '15030': "49.4' × 10'",
  '16025': "53' × 8.4'",
  '16030': "53' × 10'",
  '18025': "59' × 8.4'",
  '18030': "59.4' × 10'",
  '18037': "59' × 12.3'",
  '19025': "62.3' × 8.4'",
  '24025': "79' × 8.4'",
  '24030': "79' × 10'",
  '24035': "79' × 12'",
  '30037': "100' × 12'",
}

function getCuttingArea(model: string): string {
  const m = model.match(/(\d{4,5})/)
  if (!m) return ''
  const feet = formatSizeInFeet(m[1])
  if (feet) return feet.replace(/ ft$/, '').replace(/ × /g, "' × ") + "'"
  return CUTTING_AREAS[m[1]] ?? ''
}

function machineKw(power: string): number {
  const m = power.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

function cuttingHeadBullet(power: string): string {
  if (machineKw(power) >= 50) {
    return 'EVO4 cutting head — required for 50kW+ (machine-specific focal configuration; not user-adjustable on 60kW builds)'
  }
  return 'EVO3 autofocusing cutting head — up to 50kW / 25 bar, focal configs 150/200/250mm'
}

type MachineFamily = 'FAST' | 'XME' | 'XMF' | 'PLUS_BEVEL' | 'PLUS_EVO' | 'FIBER_HD' | 'TUBE' | 'GENERIC'

function getMachineFamily(model: string): MachineFamily {
  const u = model.toUpperCase()
  if (/PLUS\s*BEVEL/i.test(u))          return 'PLUS_BEVEL'
  if (/PLUS\s*EVO/i.test(u))            return 'PLUS_EVO'
  if (/FIBER\s*HD|FHD/i.test(u))        return 'FIBER_HD'
  if (/TUBE|TL\d/i.test(u))             return 'TUBE'
  if (/\bXMF\b/i.test(u))               return 'XMF'
  if (/\bXME\b/i.test(u))               return 'XME'
  if (/FAST/i.test(u))                  return 'FAST'
  return 'GENERIC'
}

function getFamilyDisplayName(family: MachineFamily, model: string): string {
  if (family === 'PLUS_BEVEL') return 'PLUS Bevel'
  if (family === 'PLUS_EVO')   return 'PLUS EVO'
  if (family === 'FIBER_HD')   return 'FIBER HD'
  if (family === 'TUBE')       return 'FIBER Tube'
  if (family === 'XMF')        return 'XMF'
  if (family === 'XME')        return 'XME'
  if (family === 'FAST')       return /demo/i.test(model) ? 'Demo FAST' : 'FAST'
  return model
}

// Maps machine family to the rendered PNG from brochure covers
function getMachineImage(family: MachineFamily): string | null {
  const map: Partial<Record<MachineFamily, string>> = {
    FAST:      '/machines/fast-render.png',
    XME:       '/machines/xme-render.png',
    XMF:       '/machines/xmf-render.png',
    PLUS_BEVEL:'/machines/plus-bevel-render.png',
    PLUS_EVO:  '/machines/plus-evo-render.png',
    FIBER_HD:  '/machines/fiberhd-render.png',
    TUBE:      '/machines/tube-render.png',
  }
  return map[family] ?? null
}

function getIntroText(family: MachineFamily, model: string, power: string): string {
  const displayName = getFamilyDisplayName(family, model)
  return `We are pleased to provide you with detailed information regarding our Cutlite America high power fiber laser systems. You specifically requested information regarding the ${displayName} ${power} laser system, and we are providing that information below.`
}

function getMachineFeatures(family: MachineFamily, model: string, power: string, laser: string, area: string): string[] {
  const areaLine = area ? [`Cutting area: ${area}`] : []

  if (family === 'FAST') return [
    ...areaLine,
    'Linear motor drive system — 4.2G max acceleration with zero jerk technology',
    'Fully redesigned low-mass gantry: 100mm-thick side frames, lower center of gravity',
    'EVO3 autofocusing cutting head — up to 50kW / 25 bar, focal configs 150/200/250mm',
    `${laser} fiber laser source (${power}) housed in NEMA 12 sealed, air-conditioned cabinet`,
    'Smart Manager Plus CNC supervision software',
    'SMART Changer option — 10-position automatic nozzle change with cleaning & calibration',
    'SMART Mix option — real-time automatic gas mix (O₂/N₂) for all material types',
    '2-level shuttle table — capacity: 2 sheets of 1" thick material',
    'Automation ready — compatible with SMART Flow CS load/unload systems',
    'Cuts material up to 1" (25mm) thickness at maximum speed',
    'Designed and built in Prato, Italy',
  ]

  if (family === 'XME') return [
    ...areaLine,
    'Rack-and-pinion drive with brushless motors — 2G max acceleration',
    'EVO3 autofocusing cutting head — same system as FIBER Plus flagship models',
    `${laser} fiber laser source (${power}) housed in NEMA 12 sealed, air-conditioned cabinet`,
    'Smart Manager CNC software with automatic sheet recognition',
    'Modular 500mm worktable sections with scrap collection; machine generates replacement slats automatically',
    'SMART Changer option (15 & 20kW) — automatic nozzle change',
    'SMART Mix option (15 & 20kW) — automatic gas mix system',
    'SMART Raster option — 3D relief marking directly on the laser',
    '2-level shuttle table — capacity: 2 sheets of 1" thick material',
    'Automation ready',
    'CE certified; CSA-certified for Canadian market',
    'Components designed and manufactured in Prato, Italy',
  ]

  if (family === 'XMF') return [
    ...areaLine,
    'Rack-and-pinion drive with brushless motors — compact, fully enclosed cabinet design',
    'EVO3 autofocusing cutting head — up to 20kW / 25 bar, non-contact capacitive sensors',
    `${laser} fiber laser source (${power}) housed in NEMA 12 sealed, air-conditioned cabinet`,
    'Smart Manager Plus CNC software — same system used in flagship PLUS models',
    'Front access door, rear loading with dual workbenches',
    'Electrical cabinet separated from main structure for simplified maintenance',
    'SMART Bevel Pro option — bevel cuts up to ±45° (V, A, X, Y, K types)',
    'SMART Changer option — 10-position automatic nozzle change',
    'SMART Mix option — automatic O₂/N₂ gas mix system',
    'Designed and built in Prato, Italy',
  ]

  if (family === 'PLUS_BEVEL') return [
    ...areaLine,
    'Bevel cutting 1°–45° (V+, V−, Y+, Y−, X, K) without affecting cut flatness or quality',
    'Linear motor drive with absolute inductive encoders on B and C axes — 1.8G max acceleration',
    'Electro-welded thermally stabilized steel frame with cast aluminum alloy gantry structure',
    cuttingHeadBullet(power),
    `IPG fiber laser source (${power}) housed in NEMA 12 sealed, air-conditioned cabinet`,
    'Two-level pallet exchange system',
    'SMART Changer option — 10-position automatic nozzle change with cleaning & calibration',
    'SMART Mix option — real-time automatic gas mix; saves gas, delivers cool parts for fast removal',
    'Cut parts transfer directly to robotic welding — no secondary milling or deburring required',
    'Power options from 6kW up to 60kW',
    'Designed and built in Prato, Italy',
  ]

  if (family === 'PLUS_EVO') return [
    ...areaLine,
    'Linear motor drive with absolute inductive encoders — 3.2G max acceleration',
    'Lighter gantry design: cast aluminum alloy elements on electro-welded thermally stabilized frame',
    cuttingHeadBullet(power),
    `IPG fiber laser source (${power}) housed in NEMA 12 sealed, air-conditioned cabinet`,
    'Smart Manager Plus CNC software',
    'Two-level lift pallet exchange system',
    'Cuts up to 2" (50mm) on mild steel, carbon steel, and stainless steel',
    'SMART Changer option — 10-position automatic nozzle change',
    'SMART Mix option — automatic gas mix for all material types',
    'Automation ready — compatible with SMART Flow CS systems',
    '24/7 production capability',
    'Power options from 6kW up to 60kW',
    'Designed and built in Prato, Italy',
  ]

  if (family === 'FIBER_HD') return [
    ...areaLine,
    'Rack-and-pinion drive (external to frame — unaffected by cutting debris) — 1.2G acceleration',
    'Aluminum electro-welded gantry enclosure — light, rigid, moves via rack and pinion',
    cuttingHeadBullet(power),
    `${laser} fiber laser source (${power}) housed in NEMA 12 sealed, air-conditioned cabinet`,
    'Large format capability — working areas from 13.3′×6.7′ up to 100′×12′',
    'Robust steel table structure — fast forklift or crane loading/unloading',
    'Cuts up to 4" thick material',
    'SMART Bevel Pro option — bevel cuts up to ±45°; cut parts ready for robotic welding',
    'SMART Drill option — 6-position tooling turret for drilling, countersinking, thread-cutting',
    'Both IPG and Raycus resonators available',
    'Monthly cleaning is essentially the only routine maintenance required',
    'Designed and built in Prato, Italy',
  ]

  if (family === 'TUBE') return [
    'Round tube cutting: 0.59″–12.01″ diameter (model dependent)',
    'Square/rectangular tube cutting up to 8.66″',
    'Wall thickness up to 0.39″; max bar weight 40 kg/m',
    'Bar loading lengths: 21 ft, 30 ft, or 40 ft',
    'Unloading length: 10 ft up to 40 ft',
    'Complete tube processing in a single cycle — no secondary operations required',
    'Contactless laser operation — minimal part deformation',
    'CNC software manages bar loading, cutting, and finished part unloading seamlessly',
    'Electro-welded frame with linear motor technology — stable, repeatable, high uptime',
    'Smart Bevel Pro option — bevel up to 45°',
    'Smart Weld option — real-time internal/external weld seam identification',
    'Smart Mandrel option — flow drilling and tapping up to M12 with automatic tool change',
    'Handles round, square, rectangular tubes, and open profiles',
    'Compatible materials: mild steel, stainless steel, alloy steel, aluminum, brass, copper',
  ]

  // GENERIC fallback
  return [
    ...areaLine,
    'EVO3 autofocusing cutting head',
    `${laser} fiber laser source (${power})`,
    'Smart Manager Plus CNC software',
    'Designed and built in Prato, Italy',
  ]
}

function getQuotedSolutionText(family: MachineFamily): { intro: string; structure: string; gantry: string } {
  if (family === 'FAST') return {
    intro: 'The FAST is Cutlite America\'s revolutionary lightning-fast fiber laser model, designed and tested to achieve high-speed movements up to 4.2G when cutting material up to 1" without compromising quality, even on the most complex shapes. The FAST features a new gantry design to achieve zero jerk acceleration with no vibration and exceptional cutting speeds — outperforming all other machines currently on the market.\n\nEvery design element of this machine has been engineered and built in Prato, Italy. This ensures the highest level of consistent cutting quality and unparalleled reliability, offering a dramatic competitive advantage that will separate you from your competitors.',
    structure: 'The FAST model features a fully redesigned gantry to minimize weight while retaining the rigidity required for a stable and repeatable cutting result. The machine\'s base is built with 100mm-thick side frames and a lower center of gravity. The result is an extremely low mass ratio of static parts to moving parts, allowing linear motors — the same reliable motors used on the PLUS models — to be placed in a horizontal configuration on the shoulders of the base structure.',
    gantry: 'This configuration optimizes dynamic performance and enables zero radial jerk movements without producing vibrations that could cause movement of the material on the cutting table.',
  }

  if (family === 'XME') return {
    intro: 'The XME product line brings high-quality Italian-designed and built fiber lasers to companies seeking to increase productivity and profit. This practical, affordable, and compact machine brings European quality to the entry-level and add-on market segments, replacing obsolete plasma and waterjet cutting technologies.\n\nThe XME is produced in-house at Cutlite Penta facilities in Italy with the same construction quality standards as the FIBER Plus EVO and Bevel models. It is fully compliant with CE regulations and CSA-certified for the Canadian market.',
    structure: 'The base support structure is made of robust and durable electro-welded steel, while the gantry mechanism features a lightweight yet rigid steel beam to accommodate thermal expansion without distortion.',
    gantry: 'This configuration, combined with Cutlite America\'s numeric control, enables the brushless motor system with rack-and-pinion drive to achieve outstanding dynamic performance.',
  }

  if (family === 'XMF') return {
    intro: 'The XMF is the compact solution that brings the precision and performance of Italian laser technology within reach of anyone entering the world of laser cutting, or expanding an existing setup. It is a system that is simple, powerful, and reliable.\n\nEquipped with brushless motors, rack-and-pinion transmission, and a rigid steel frame, the XMF features the same high-performance cutting head and Smart Manager Plus software used in Cutlite America\'s flagship systems — delivering exceptional cutting accuracy, consistency, and reliability.',
    structure: 'A practical design enhances ease of use with a front access door, rear loading with dual workbenches, and an electrical cabinet separated from the main structure for greater flexibility and simplified maintenance.',
    gantry: 'The XMF uses the EVO3 cutting head, completely designed and manufactured in Prato, Italy — equipped with non-contact capacitive sensors and gas-mix capabilities. The head and focusing lenses can be used with up to 20kW of laser power at a pressure of 25 bar.',
  }

  if (family === 'PLUS_BEVEL') return {
    intro: 'The PLUS BEVEL is designed for applications where angled cuts at varying degrees from 1° to 45° are required. The primary benefit is to increase the consistency of bevel angle cuts to create a stronger welding point, especially when utilizing robotic welding machines.\n\nThe PLUS BEVEL system accommodates the most requested types of angled cuts including V (positive and negative), Y (positive and negative), X, and K up to 45° without affecting the quality or flatness of the cut. The movement of the axis is fluid and consistent, ensuring continuity of the cutting process — synchronized in real-time by Cutlite America\'s exclusive numerically controlled software.',
    structure: 'The base is an electro-welded, thermally stabilized steel frame, machined to accommodate high-precision rails and linear motors. The gantry structure is manufactured with cast aluminum alloy elements to which the steel beam is attached, creating a lightweight yet durable structure.',
    gantry: 'Driven by linear motors with absolute inductive encoders to support motors for the B and C axes, bevel cutting up to ±45° is extremely accurate and consistent. Finished cut parts can be directly transferred to robotic welding stations, eliminating additional milling and deburring steps in the production process.',
  }

  if (family === 'PLUS_EVO') return {
    intro: 'The PLUS EVO range stems from the extensive experience Cutlite America has accumulated over the last decade through their ongoing commitment and investment into constant in-house research and development. Every component is designed in-house, while 90% of machine components are manufactured on premises — all designed and built in Prato, Italy.\n\nThe quality of movement is ensured by the best linear motors available on the market, which when combined with the IPG laser source and a robust frame design allows you to run a Cutlite America laser 24 hours per day, seven days per week. With a lighter gantry, the PLUS EVO is a leading platform for both high-quality cutting and high acceleration — for a rapid cut and a fast return on investment.',
    structure: 'The base is an electro-welded, thermally stabilized steel frame, machined to accommodate high-precision rails and linear motors. The gantry structure is made with cast aluminum alloy elements to which a steel beam is attached, creating a lightweight yet durable structure.',
    gantry: 'Driven by linear motors with absolute inductive encoders, the PLUS EVO achieves 3.2G max acceleration — ensuring unmatched cutting quality up to 50mm (2 inches) on most materials including mild steel, carbon steel, and stainless steel.',
  }

  if (family === 'FIBER_HD') return {
    intro: 'The FIBER HD combines the practicality and simplicity of large-format cutting systems with the power of fiber laser technology up to 60kW. The gantry-style cabinet enclosure brings high-performance fiber laser cutting to industrial sectors previously relying on oxy-fuel, plasma, or CO₂ cutting technology.\n\nFully manufactured and designed in Prato, Italy, the FIBER HD is the technological benchmark for large-format machines. The combination of over a decade of experience implementing high-power laser systems and a high-quality supply chain is reflected in the choice of the highest quality materials.',
    structure: 'The robust steel table structure, extended along the X-axis, ensures fast and trouble-free loading and unloading of large plates with a forklift or existing overhead cranes. This proven system virtually eliminates any maintenance except for recommended monthly cleaning.',
    gantry: 'The electro-welded architecture of the aluminum frame is extremely light but rigid and strong enough to support the cutting head movement. The enclosed laser cabin moves easily via precise rack-and-pinion drives to closely follow the cutting process. Rack and pinion motors are located on the outside of the machine frame, ensuring cutting process debris does not affect machine operation.',
  }

  if (family === 'TUBE') return {
    intro: 'Cutlite America\'s Fiber Tube system represents the next evolution in high-performance tube processing. Designed for precision, flexibility, and fully automated operation, the Fiber Tube line delivers finished parts — complete with all required cutting operations — in a single cycle. This system eliminates the need for multiple machining centers and reduces handling, setup, and processing times dramatically.\n\nBuilt for manufacturers who demand speed, accuracy, and scalability, the Fiber Tube machine handles round, square, and rectangular tubes as well as open profiles with exceptional ease and reliability.',
    structure: 'Every component of the Fiber Tube system is engineered to support high-speed, high-accuracy cutting without compromising cut quality. Thanks to its robust electro-welded frame, linear motor technology, and fully enclosed cutting head, the system ensures stability, repeatability, and unmatched uptime even in demanding production environments.',
    gantry: 'The CNC software manages every step of the process — from bar loading to cutting to finished part unloading — creating a seamless, operator-friendly workflow. Optional rear or front loading configurations adapt to your production layout. Automatic step and bundle loaders minimize idle time, while integrated sensors and vision systems ensure consistency throughout the job.',
  }

  // GENERIC fallback
  return {
    intro: 'The Cutlite America laser system was developed through extensive experience accumulated over the last decade through ongoing commitment and investment into constant in-house research and development. Every component in our machinery is designed in-house, while 90% of machine components are manufactured on premises. Every element of this machine is designed and built in Prato, Italy to ensure consistent cutting quality and unparalleled reliability.',
    structure: 'The base is an electro-welded, thermally stabilized steel frame, machined to accommodate high-precision rails and linear motors. The gantry structure is made with cast aluminum alloy elements to which the steel beam is attached, creating a lightweight yet durable structure.',
    gantry: 'The gantry structure is made up of a light and rigid steel beam to compensate for thermal expansion without deformation. This configuration allows noteworthy dynamic performance.',
  }
}

// Descriptions for SMART options in Section 3
const OPTION_DESCRIPTIONS: Record<string, { title: string; body: string }> = {
  'SMART Mix': {
    title: 'SMART MIX (OPTION)',
    body: 'Smart Gas Mix is an internally developed component that improves the cutting process thanks to hardware technology controlled in real time by our Smart Manager software. With just a few clicks, the right amount of oxidizer can be supplied, adapted for type and thickness. The result is incredible production performance, excellent finish, without the need for bulky external equipment. SMART Gas Mix technology uses technical nitrogen and oxygen gas systems, combining the right quantities via software in a safe, reliable and flexible way.',
  },
  'SMART Changer': {
    title: 'SMART CHANGER (OPTION)',
    body: 'The automatic nozzle change is an option that allows the machine to automatically replace the cutting head nozzle without operator intervention. Up to 10 positions are available, and the system includes both cleaning and calibration. This eliminates downtime associated with manual nozzle changes and ensures consistent cut quality across long production runs.',
  },
  'SMART Grease': {
    title: 'SMART GREASE (OPTION)',
    body: 'SMART Grease automatically greases the X and Y axis linear drives at programmed intervals, ensuring consistent lubrication without operator intervention. This reduces maintenance burden and protects the precision linear drive system from premature wear.',
  },
  'SMART Door': {
    title: 'SMART DOOR (OPTION)',
    body: 'An additional side door for machine sizes 3015 up to 6025, providing convenient access to the cutting table from the side of the machine. Ideal for facilities where access from the front or rear of the machine is restricted.',
  },
  'SMART Raster': {
    title: 'SMART RASTER (OPTION)',
    body: 'SMART Raster enables high-quality 3D relief marking directly on the laser cutting machine. This capability allows manufacturers to add part numbers, logos, or other markings to cut parts without requiring a separate marking station.',
  },
  'SMART Set Up': {
    title: 'SMART SET UP — AUTOMATION PRECONFIG (OPTION)',
    body: 'SMART Set Up provides a factory predisposition for future automation integration, including all necessary mechanical, electrical, and software preparation. This allows customers to add load/unload automation at a later date without machine downtime for retrofit work.',
  },
  'Piston Lift': {
    title: 'PISTON LIFT (OPTION)',
    body: 'The hydraulic piston lift provides a powered sheet lifter integrated into the pallet exchange system, enabling rapid and ergonomic loading of heavy sheet metal without the need for external lifting equipment.',
  },
  'UL Certification': {
    title: 'UL CERTIFICATION (OPTION)',
    body: 'UL Certification provides US electrical safety certification for the machine, required by certain facilities and insurance policies. The certification covers the electrical panel and associated control systems.',
  },
  'CAD/CAM Software': {
    title: 'CAD/CAM SOFTWARE (OPTION)',
    body: 'Lantek or SigmaNAST 2D/3D CAD/CAM software license for nesting, programming, and managing laser cutting jobs. Fully integrated with the Cutlite Smart Manager Plus control system for seamless job transfer.',
  },
  'Side Load': {
    title: 'SIDE LOAD CONFIGURATION (OPTION)',
    body: 'Side-access sheet loading configuration for facilities where standard front/rear loading is not possible due to space constraints. The side load configuration maintains the full performance of the standard pallet exchange system.',
  },
  'Inline Automation': {
    title: 'INLINE AUTOMATION (OPTION)',
    body: 'Inline load/unload automation provides automated sheet feeding and finished part handling without a tower storage system. Ideal for high-volume production runs with consistent sheet sizes.',
  },
  'SMART Flow CS — Load/Unload Automation (No Tower)': {
    title: 'SMART FLOW CS — LOAD/UNLOAD AUTOMATION (NO TOWER)',
    body: 'SMART Flow CS provides automated sheet loading and finished part unloading without a tower storage system. The system integrates directly with the Cutlite Smart Manager Plus software for fully automated production scheduling and job management.',
  },
  'SMART Flow CS — Load/Unload Automation with Tower': {
    title: 'SMART FLOW CS — LOAD/UNLOAD AUTOMATION WITH TOWER',
    body: 'SMART Flow CS with tower provides automated sheet loading from a multi-level tower storage system, combined with automated finished part unloading. The 90-degree tower design maximizes sheet storage density while minimizing floor space. The system integrates directly with the Cutlite Smart Manager Plus software for lights-out production capability.',
  },
  'Bevel Head': {
    title: 'BEVEL HEAD',
    body: 'Bevel cutting capability for weld-ready angled cuts. On PLUS Bevel machines this is included in the base machine; on other lines it is an optional add-on.',
  },
  'Plus Bevel Head': {
    title: 'PLUS BEVEL HEAD',
    body: 'The multi-axis Plus Bevel head enables bevel cutting up to ±45° in all directions, driven by precision linear motors with absolute inductive encoders on the B and C axes. This capability allows cut-ready weld preparation directly on the laser, eliminating secondary beveling operations.',
  },
  'Basic Bevel Head': {
    title: 'BASIC BEVEL HEAD',
    body: 'The single-axis Basic Bevel head provides bevel cutting capability for standard weld preparation angles. The head is driven by a precision servo motor and supports bevel angles up to ±30°.',
  },
}

function matchOptionDescription(description: string): { title: string; body: string } | null {
  for (const [key, val] of Object.entries(OPTION_DESCRIPTIONS)) {
    if (description.toLowerCase().includes(key.toLowerCase())) return val
  }
  return null
}

// ── Section heading component ─────────────────────────────────────────────────
function SectionHeading({ num, line1, line2, sub }: { num: string; line1: string; line2?: string; sub?: string }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', padding: '40px 56px 28px' }}>
      <div style={{
        position: 'absolute', left: '32px', top: '-12px',
        fontSize: '200px', fontWeight: 900, color: '#EBEBEB',
        lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
        fontStyle: 'italic',
      }}>
        {num}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '48px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
          {line1}
        </div>
        {line2 && (
          <div style={{ fontSize: '48px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
            {line2}
          </div>
        )}
        {sub && (
          <div style={{ fontSize: '13px', color: C.midGray, marginTop: '12px', maxWidth: '400px', lineHeight: '1.6' }}>
            {sub}
          </div>
        )}
        <div style={{ marginTop: '12px', width: '36px', height: '3px', background: C.crimson }} />
      </div>
    </div>
  )
}

function Rule() {
  return <div style={{ height: '1px', background: C.rule, margin: '0 56px' }} />
}

function SubHeading({ children }: { children: string }) {
  return (
    <div style={{ fontSize: '18px', fontWeight: 800, color: C.darkGray, textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.5px' }}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QuoteDocument({ quote, isPdf = false }: Props) {
  const lineItems: LineItem[] = JSON.parse(quote.lineItemsJson)
  const issued    = formatDate(quote.createdAt)
  const expires   = expiryDate(quote.createdAt)
  const deliveryWeeks = quote.deliveryWeeks ?? 12

  const laserLabel = canonicalLaserSource(quote.laserSource)

  const family      = getMachineFamily(quote.machineModel)
  const displayName = getFamilyDisplayName(family, quote.machineModel)
  const cuttingArea = getCuttingArea(quote.machineModel)
  const features    = getMachineFeatures(family, quote.machineModel, quote.machinePower, laserLabel, cuttingArea)
  const solText     = getQuotedSolutionText(family)
  const introText   = getIntroText(family, quote.machineModel, quote.machinePower)
  const machineImg  = getMachineImage(family)

  const billableItems = lineItems.filter(li => !li.included)
  const includedItems = lineItems.filter(li => li.included)

  // Options to describe in section 3 (non-machine-base, non-warranty, non-training items)
  const optionItems = lineItems.filter(li =>
    !li.included &&
    !li.description.toLowerCase().includes('warranty') &&
    !li.description.toLowerCase().includes('training') &&
    !li.description.toLowerCase().includes('freight') &&
    li.unitPrice > 0
  ).slice(1) // skip machine base (first item)

  const sectionBg: React.CSSProperties = { background: C.white, marginTop: '2px' }
  const bodyText: React.CSSProperties  = { fontSize: '13px', color: C.midGray, lineHeight: '1.75', padding: '0 56px' }

  return (
    <div
      id="quote-document"
      style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: C.darkGray, background: C.pageBg, maxWidth: '900px', margin: '0 auto' }}
    >
      {!isPdf && (
        <div style={{ background: '#FFF8E6', borderBottom: '1px solid #E8C547', padding: '12px 56px', fontSize: '13px', color: '#7A5C00' }}>
          <strong>Internal preview only.</strong> Customer-facing quotes must use the confirmed HubSpot template after publish — this document is a draft reference, not the final quote.
        </div>
      )}

      {/* ════════════════════════════════════════════
          COVER PAGE
      ════════════════════════════════════════════ */}
      <div style={{ background: C.pageBg, padding: '48px 56px 56px', position: 'relative', overflow: 'hidden' }}>
        {/* Logo */}
        <img src="/logos/logo-black.png" alt="Cutlite America" style={{ height: '52px', objectFit: 'contain', marginBottom: '48px' }} />

        {/* Deal title */}
        <div style={{ fontSize: '18px', fontWeight: 700, color: C.darkGray, letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: '1.3', marginBottom: '8px' }}>
          {quote.company} — {quote.machineModel} {quote.machinePower}
        </div>
        <div style={{ width: '36px', height: '3px', background: C.darkGray, marginBottom: '32px' }} />

        {/* Two-column layout: contact info left, machine image right */}
        <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ flex: '0 0 auto' }}>
            {/* Prepared for */}
            <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.8', marginBottom: '32px' }}>
              <div style={{ fontSize: '12px', color: C.lightGray, marginBottom: '4px' }}>Prepared for</div>
              <div style={{ fontWeight: 700, color: C.darkGray, fontSize: '15px' }}>{quote.company}</div>
              {quote.contactName  && <div style={{ fontWeight: 600 }}>{quote.contactName}</div>}
              {quote.contactEmail && <div style={{ color: C.lightGray }}>{quote.contactEmail}</div>}
              {quote.contactPhone && <div>{quote.contactPhone}</div>}
            </div>

            <div style={{ width: '36px', height: '3px', background: C.darkGray, marginBottom: '20px' }} />

            {/* Cutlite address */}
            <div style={{ fontSize: '12px', color: C.midGray, lineHeight: '1.8' }}>
              <div style={{ fontWeight: 700, color: C.darkGray }}>Cutlite America, LLC</div>
              <div>1075 Windward Ridge Parkway</div>
              <div>Suite 120</div>
              <div>Alpharetta, GA 30005</div>
              <div>United States</div>
              <div style={{ marginTop: '8px' }}>{quote.createdBy}</div>
              <div style={{ color: C.lightGray }}>sales@cutlite.com</div>
            </div>
          </div>

          {/* Machine render */}
          {machineImg && (
            <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <img
                src={machineImg}
                alt={`${displayName} laser cutting machine`}
                style={{ maxWidth: '420px', width: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.12))' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 1 — INTRODUCTION
      ════════════════════════════════════════════ */}
      <div style={sectionBg}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', padding: '40px 56px 0', alignItems: 'start' }}>
          {/* Left: large heading */}
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '200px', fontWeight: 900, color: '#EBEBEB', lineHeight: 0.85, userSelect: 'none', fontStyle: 'italic', position: 'absolute', left: '-12px', top: '-20px' }}>
              1
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '52px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
                INTRO
              </div>
              <div style={{ fontSize: '52px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
                DUCTION
              </div>
              <div style={{ marginTop: '16px', width: '36px', height: '3px', background: C.crimson }} />
            </div>
          </div>
          {/* Right: intro text */}
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.8', paddingTop: '24px' }}>
            {introText}
          </div>
        </div>

        {/* Machine header card */}
        <div style={{ margin: '40px 56px', background: C.pageBg, borderRadius: '8px', padding: '20px 28px', display: 'flex', alignItems: 'center', gap: '24px', overflow: 'hidden' }}>
          {machineImg && (
            <img
              src={machineImg}
              alt={displayName}
              style={{ height: '90px', objectFit: 'contain', flex: '0 0 auto', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.10))' }}
            />
          )}
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: C.darkGray, textTransform: 'uppercase' }}>
              {quote.machineModel} {quote.machinePower}
            </div>
            <div style={{ fontSize: '13px', color: C.midGray, marginTop: '4px' }}>
              {laserLabel} Laser Source{cuttingArea ? ` · Cutting Area: ${cuttingArea}` : ''}
            </div>
          </div>
        </div>

        {/* Features */}
        <div style={{ padding: '0 56px 48px' }}>
          <SubHeading>Features</SubHeading>
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.7' }}>
            <div style={{ marginBottom: '6px' }}>The Cutlite America {displayName} features:</div>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {features.map((f, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>{f}</li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: '24px', fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>
            Combining high quality magnetic linear motors with {laserLabel} fiber laser sources produces high dimensional accuracy when cutting carbon steel and stainless steel. Cutlite Penta&apos;s EVO3 Cutting Head allows higher pressure cuts with less nitrogen than our competitors.
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 2 — OUR STORY
      ════════════════════════════════════════════ */}
      <div style={sectionBg}>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', padding: '40px 56px 36px', alignItems: 'start' }}>
          {/* Left: section heading */}
          <div style={{ position: 'relative', paddingTop: '8px' }}>
            <div style={{ fontSize: '180px', fontWeight: 900, color: '#EBEBEB', lineHeight: 0.85, userSelect: 'none', fontStyle: 'italic', position: 'absolute', left: '-16px', top: '-16px' }}>
              2
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '52px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
                OUR
              </div>
              <div style={{ fontSize: '52px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>
                STORY
              </div>
              <div style={{ marginTop: '16px', width: '36px', height: '3px', background: C.crimson }} />
            </div>
          </div>

          {/* Right: company story */}
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.8' }}>
            <p><strong style={{ color: C.darkGray }}>Cutlite Penta S.p.A.</strong> was founded in 1992 as a division of El.En. group to design and build the first machines to cut wood and plastic materials using resources built by El.En. El.En. group is a well-established Italian company listed on both the Italian and U.S. stock exchanges, with a market capitalization of 1.34 billion euro.</p>
            <p style={{ marginTop: '12px' }}>To date, Cutlite Penta S.p.A. has become the standard for metal cutting in Europe with a total turnover of 235 million euro at the end of fiscal year 2022.</p>
            <p style={{ marginTop: '12px' }}>By giving their in-house technical experts decision-making and leadership roles, Cutlite Penta has continued to design the best fiber lasers on the market and push past the boundaries of existing technology. An example of this is Cutlite Penta&apos;s proprietary cutting head — the EVO 3 Cutting Head. It is currently the only cutting head in existence capable of effectively supporting laser cuts on metal with power at 50kW. The result is impeccable cuts even on high thicknesses, up to 50mm.</p>
            <p style={{ marginTop: '12px' }}>After meeting the demands for high-quality, high-power fiber lasers in the Brazilian and European markets, demand from the United States began to increase. In 2022, Cutlite Penta approached Mark Doxtader to lead the American arm. Mark approached his business partner, Tan Tam, and the two launched Cutlite America in June 2023.</p>
            <p style={{ marginTop: '12px' }}>Cutlite America is proud to be the sole authorized distributor of Cutlite Penta fiber lasers in the United States and Canada, offering a complete turn-key experience for its customers. At our Cutlite America Experience Center in Alpharetta, Georgia, we offer training by Cutlite Penta certified technicians. Our technicians will travel to your facility to provide maintenance and warranty service, and our Parts Department will order and coordinate delivery for machine parts and consumables.</p>
          </div>
        </div>

        <Rule />

        {/* Core Values */}
        <div style={{ padding: '32px 56px 24px' }}>
          <SubHeading>Our Core Values</SubHeading>
          <div style={{ fontSize: '15px', color: C.midGray, lineHeight: '2' }}>
            {[
              'To prioritize your needs above our own;',
              'To take our customers where they want to go;',
              'To surprise and delight our customers everywhere, all the time;',
              'To be consistently dependable and reliable.',
            ].map((v, i) => <div key={i}>{v}</div>)}
          </div>
        </div>

        <Rule />

        {/* By the numbers */}
        <div style={{ padding: '32px 56px 48px' }}>
          <SubHeading>Cutlite Penta By The Numbers</SubHeading>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginTop: '16px' }}>
            {[
              { stat: '+5,500', label: 'fiber lasers installed worldwide' },
              { stat: '+850',   label: 'employees' },
              { stat: '80,000 m²', label: 'manufacturing areas' },
              { stat: '30 years', label: 'of experience' },
              { stat: '5',       label: 'international divisions' },
              { stat: '700',     label: 'machines installed each year by El.En. Group' },
            ].map(({ stat, label }) => (
              <div key={stat}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: C.crimson }}>{stat}</div>
                <div style={{ fontSize: '12px', color: C.midGray, marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 3 — QUOTED SOLUTION
      ════════════════════════════════════════════ */}
      <div style={sectionBg}>
        <SectionHeading num="3" line1="QUOTED" line2="SOLUTION" />

        <div style={{ ...bodyText, paddingBottom: '24px' }}>
          {solText.intro.split('\n\n').map((p, i) => (
            <p key={i} style={{ marginTop: i > 0 ? '12px' : 0 }}>{p}</p>
          ))}
        </div>

        <Rule />

        <div style={{ padding: '28px 56px' }}>
          <SubHeading>Structure and Movement</SubHeading>
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>{solText.structure}</div>
        </div>

        <Rule />

        <div style={{ padding: '28px 56px' }}>
          <SubHeading>Gantry</SubHeading>
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>{solText.gantry}</div>
        </div>

        {/* Dynamic option descriptions from line items */}
        {optionItems.map((item, i) => {
          const opt = matchOptionDescription(item.description)
          if (!opt) return null
          return (
            <div key={i}>
              <Rule />
              <div style={{ padding: '28px 56px' }}>
                <SubHeading>{opt.title}</SubHeading>
                <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>{opt.body}</div>
              </div>
            </div>
          )
        })}

        <Rule />

        <div style={{ padding: '28px 56px' }}>
          <SubHeading>{machineKw(quote.machinePower) >= 50 ? 'EVO 4 Cutting Head' : 'EVO 3 Cutting Head'}</SubHeading>
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>
            {machineKw(quote.machinePower) >= 50 ? (
            <p>The <strong style={{ color: C.darkGray }}>{displayName}</strong> at <strong style={{ color: C.darkGray }}>{quote.machinePower}</strong> uses the <strong style={{ color: C.darkGray }}>EVO 4</strong> cutting head required for high-power fiber laser cutting. Focal length is configured for this machine build and is not field-adjustable on 60kW systems.</p>
            ) : (
            <p>The <strong style={{ color: C.darkGray }}>{displayName}</strong> system uses the EVO 3 cutting head, an in-house designed and built autofocusing cutting head with non-contact capacitive sensors. The head itself and the focusing lenses can be used with <strong style={{ color: C.darkGray }}>up to 50kW</strong> of laser power, and a pressure of 25 bar. Focal configurations: <strong style={{ color: C.darkGray }}>150 / 200 / 250 mm</strong>.</p>
            )}
            <p style={{ marginTop: '10px' }}>The assist gas is automatically selected from the 3 different connectable gases — Air, Nitrogen and Oxygen. Service pressures are selected automatically based on the cutting parameters and materials built into our SMART Manager Plus database.</p>
            <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
              {['Integrated non-contact capacitive sensor', 'High pressure gas management', 'Protective glass change drawer', 'Connections on the top of the cutting head', 'Management of contact and collision errors', 'Focals from 150mm to 300mm', 'Maximum pressure 25 bar', 'Nozzle standoff management', 'Nozzle cleaning and automatic calibration'].map((f, i) => (
                <li key={i} style={{ marginBottom: '3px' }}>{f}</li>
              ))}
            </ul>
          </div>
        </div>

        <Rule />

        {/* Fiber laser source */}
        <div style={{ padding: '28px 56px 48px' }}>
          <SubHeading>Fiber Laser Source</SubHeading>
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>
            The highly efficient {laserLabel} laser source, featuring excellent beam quality and low consumption, is housed in an air-conditioned and sealed NEMA 12 cabinet for guaranteed operation even in the harshest of environments. The excellent reliability of the {laserLabel} source keeps maintenance costs low.
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 4 — PROJECT ESTIMATE
      ════════════════════════════════════════════ */}
      <div style={sectionBg}>

        {/* Section 4 header: split layout matching PDF exactly */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', padding: '40px 56px 32px', alignItems: 'center', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '160px', fontWeight: 900, color: '#EBEBEB', lineHeight: 0.85, userSelect: 'none', fontStyle: 'italic', position: 'absolute', left: '-12px', top: '-16px' }}>
              4
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '48px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>PROJECT</div>
              <div style={{ fontSize: '48px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>ESTIMATE</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: C.midGray, marginBottom: '16px' }}>#{quote.quoteNumber}</div>
            <div style={{ display: 'flex', gap: '32px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: C.darkGray }}>Issued</div>
                <div style={{ fontSize: '13px', color: C.midGray }}>{issued}</div>
              </div>
              <div style={{ width: '1px', background: C.rule }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: C.darkGray }}>Expires</div>
                <div style={{ fontSize: '13px', color: C.midGray }}>{expires}</div>
              </div>
            </div>
            <div style={{ marginTop: '16px', width: '36px', height: '3px', background: C.crimson }} />
          </div>
        </div>

        {/* Prepared for + intro letter */}
        <div style={{ padding: '28px 56px', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: C.darkGray, marginBottom: '4px' }}>Prepared for</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: C.darkGray }}>{quote.contactName || quote.company}</div>
          {quote.contactName && <div style={{ fontSize: '13px', color: C.midGray }}>{quote.company}</div>}
          {quote.contactEmail && <div style={{ fontSize: '13px', color: C.lightGray }}>{quote.contactEmail}</div>}
          {quote.contactPhone && <div style={{ fontSize: '13px', color: C.midGray }}>{quote.contactPhone}</div>}
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75', marginTop: '16px' }}>
            <p>We are pleased to provide you with our quotation for a new Cutlite America Laser System Model <strong style={{ color: C.darkGray }}>{quote.machineModel} {quote.machinePower}</strong> {laserLabel} laser source{cuttingArea ? `, Cutting area: ${cuttingArea}` : ''}, with the terms and conditions discussed.</p>
            <p style={{ marginTop: '10px' }}>Many thanks for your interest in Cutlite America, and please contact us at your convenience once you have reviewed this quotation.</p>
            <p style={{ marginTop: '10px' }}>Sincerely,</p>
            <p style={{ marginTop: '4px', fontWeight: 600, color: C.darkGray }}>{quote.createdBy}</p>
          </div>
        </div>

        {/* Line items table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 160px', padding: '12px 56px', borderBottom: `2px solid ${C.darkGray}`, fontSize: '11px', fontWeight: 700, color: C.darkGray, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          <div>Item</div>
          <div style={{ textAlign: 'center' }}>Quantity</div>
          <div style={{ textAlign: 'right' }}>Price</div>
        </div>

        {/* Billable items */}
        {billableItems.map((item, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 160px', padding: '18px 56px', borderBottom: `1px solid ${C.rule}`, alignItems: 'start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: C.darkGray }}>{item.description}</div>
              {item.detail && <div style={{ fontSize: '11px', color: C.lightGray, marginTop: '4px', lineHeight: '1.5' }}>{item.detail}</div>}
            </div>
            <div style={{ textAlign: 'center', fontSize: '13px', color: C.midGray, paddingTop: '2px' }}>{item.qty}</div>
            <div style={{ textAlign: 'right', paddingTop: '2px' }}>
              <div style={{ fontSize: '13px', color: C.midGray }}>{fmt(item.unitPrice)}</div>
              {item.qty > 1 && <div style={{ fontSize: '11px', color: C.lightGray, marginTop: '2px' }}>Total: {fmt(item.amount)}</div>}
            </div>
          </div>
        ))}

        {/* Included items */}
        {includedItems.map((item, i) => (
          <div key={`inc-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 160px', padding: '14px 56px', borderBottom: `1px solid ${C.rule}`, alignItems: 'start', background: '#FAFAFA' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: C.midGray }}>{item.description}</div>
              {item.detail && <div style={{ fontSize: '11px', color: C.lightGray, marginTop: '4px', lineHeight: '1.5' }}>{item.detail}</div>}
            </div>
            <div style={{ textAlign: 'center', fontSize: '13px', color: C.lightGray, paddingTop: '2px' }}>{item.qty}</div>
            <div style={{ textAlign: 'right', fontSize: '13px', color: C.lightGray, paddingTop: '2px', fontStyle: 'italic' }}>Included</div>
          </div>
        ))}

        {/* Totals */}
        <div style={{ padding: '24px 56px 48px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: C.midGray, paddingBottom: '10px', borderBottom: `1px solid ${C.rule}` }}>
              <span>One-time subtotal</span>
              <span>{fmt(quote.subtotal)}</span>
            </div>
            {quote.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: C.lightGray, padding: '10px 0', borderBottom: `1px solid ${C.rule}` }}>
                <span>Discount</span>
                <span>({fmt(quote.discountAmount)})</span>
              </div>
            )}
            {quote.freight > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: C.midGray, padding: '10px 0', borderBottom: `1px solid ${C.rule}` }}>
                <span>Freight &amp; Insurance</span>
                <span>{fmt(quote.freight)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: C.darkGray, paddingTop: '12px' }}>
              <span>Total</span>
              <span>{fmt(quote.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 5 — TERMS
      ════════════════════════════════════════════ */}
      <div style={sectionBg}>

        {/* Section 5 heading: side-by-side layout matching PDF */}
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '40px', padding: '40px 56px 28px', alignItems: 'center', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '160px', fontWeight: 900, color: '#EBEBEB', lineHeight: 0.85, userSelect: 'none', fontStyle: 'italic', position: 'absolute', left: '-12px', top: '-16px' }}>
              5
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '52px', fontWeight: 900, color: C.crimson, letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>TERMS</div>
              <div style={{ marginTop: '12px', width: '36px', height: '3px', background: C.crimson }} />
            </div>
          </div>
          <div style={{ fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>
            Please review the terms and conditions of the sale, along with important delivery and installation timelines and details.
          </div>
        </div>

        {/* Terms table */}
        <div style={{ padding: '28px 56px', fontSize: '13px', lineHeight: '1.75' }}>
          {[
            { label: 'Tariffs', value: 'All current tariffs have been accounted for in quoted price.' },
            { label: 'Delivery', value: `${quote.machineModel}: Available within ${deliveryWeeks} weeks of deposit.` },
            { label: 'Running Test', value: 'At customer facility.' },
            { label: 'Installation and Training', value: 'Included at customer site in quoted price.' },
            { label: 'Transport and Insurance', value: 'Delivery to customer site included in price.' },
            {
              label: 'Payment Terms',
              value: (
                <div>
                  <div>30% down payment with written purchase order and signed agreement</div>
                  <div>60% prior to shipment</div>
                  <div>10% after Site Acceptance Test (SAT)</div>
                </div>
              ),
            },
            {
              label: 'Warranty',
              value: '24 months from installation on the fiber laser source, cutting head, guides, optical scales, linear motors, and electrical panel. The cutting head is warranted if dirt penetrates the top side of the cutting head, but not if contamination occurs on the bottom side. For any technical assistance during the warranty period, you will be billed for travel and lodging expenses of the Cutlite technical staff. All operations on the fiber source will be carried out by technicians of the fiber source manufacturer. The fiber source warranty does not cover defects or damage resulting from: output terminations, retro reflection, unauthorized modifications, improper use, negligence, or operation outside the specified environment. Consumable materials such as nozzles, ceramics, worktop grille, bellows, and lens protection glasses are not covered by warranty.',
            },
            { label: 'Expiration of Offer', value: '30 days from date of issue.' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', padding: '14px 0', borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ fontWeight: 700, color: C.darkGray }}>{label}</div>
              <div style={{ color: C.midGray }}>{value}</div>
            </div>
          ))}
        </div>

        {quote.notes && (
          <div style={{ padding: '0 56px 24px', fontSize: '13px', color: C.midGray }}>
            <div style={{ fontWeight: 700, color: C.darkGray, marginBottom: '4px' }}>Special Notes</div>
            <div>{quote.notes}</div>
          </div>
        )}

        {/* Agreement terms */}
        <Rule />
        <div style={{ padding: '28px 56px 0' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: C.darkGray, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>
            Agreement Terms
          </div>
          <div style={{ fontSize: '12px', color: C.midGray, lineHeight: '1.8', textTransform: 'uppercase', fontWeight: 600, marginBottom: '16px' }}>
            This agreement and any addendums or exhibits are subject to the additional terms and conditions below hereof specifically including, without limitation, the warranties and limitation of seller&apos;s liability.
          </div>
          <div style={{ fontSize: '12px', color: C.midGray, lineHeight: '1.75', marginBottom: '16px' }}>
            Although this Agreement may have been executed by an agent of Seller, it is not binding on Seller until executed by an officer of Seller at Seller&apos;s principal office stated above. Purchaser&apos;s signature represents a firm offer to purchase pursuant to the terms and conditions stated below.
          </div>
          <ol style={{ fontSize: '12px', color: C.midGray, lineHeight: '1.75', paddingLeft: '20px' }}>
            {[
              { title: 'PAYMENTS', text: 'Purchaser shall pay all amounts payable to Seller when due, time being the essence herein.' },
              { title: 'TAXES', text: "Purchaser shall pay or upon receipt of invoice from Seller shall reimburse Seller for all sales, use, and other taxes or charges that may now or hereafter be levied or imposed upon the Machinery or is required to be collected by Seller or imposed on the Machinery or upon Seller resulting from this transaction or any part thereof irrespective of whether included on the face hereof, but specifically not including any taxes levied upon Seller by measure of Seller's income." },
              { title: 'NOTIFICATION FOR DELIVERY', text: 'If purchase is delivered and installed, Seller shall notify Purchaser in writing when the Machinery purchased hereunder is ready for delivery to Purchaser. Said notice shall include (a) payment to Seller for any portion of the purchase price due prior to delivery as provided on the face page of this Agreement and (b) a statement that all preparations by Purchaser for installation have been made as required herein.' },
              { title: 'TITLE-RISK OF LOSS-INSURANCE', text: 'Title to and risk of loss of the Machinery shall pass from the Seller to the Purchaser when the Machinery or component part is received on the Purchaser\'s dock or designated delivery site or is otherwise deemed delivered as provided herein. Purchaser shall procure insurance insuring the Machinery against "all risks" subject to normal exclusions in an amount not less than the purchase price of the Machinery, such insurance to cover the Machinery during installation, and continuously thereafter until all amounts payable by Purchaser are paid in full to Seller.' },
              { title: 'INSTALLATION', text: 'If Seller is installing the Machinery, Purchaser shall obtain all necessary permits and licenses for the installation of the Machinery and shall provide a suitable foundation for movement and assembly of Machinery including adequate access to buildings, assembly space, and adequate compressed air, water, gas and electrical power supplies to the appropriate connections on the Machinery. Seller shall furnish at its expense all skilled and unskilled labor and all materials required to unpack, erect, start, test and adjust the Machinery.' },
              { title: 'LIMITED WARRANTY', text: 'Seller warrants that upon installation by seller, the machinery will successfully perform as warranted. Other than the foregoing warranty there are no express or implied warranties or any affirmations of fact or promises by seller to purchaser with respect to the machinery. The seller hereby disclaims any implied warranties of merchantability, fitness for any particular purpose, or infringement not expressly contained herein. If purchaser desires to assert a claim for breach of warranty, the action must be commenced no later than one year after the accrual of the cause of action.' },
              { title: 'LIMITATION OF LIABILITY, REMEDIES AND DAMAGES', text: 'The sole responsibility and liability of seller shall be limited to the repair of the machinery to conform to the warranty or, at seller\'s option, the return to purchaser of monies actually paid to seller in connection with the purchase of the machinery, without interest. In no event shall seller be liable to purchaser for economic loss, compensatory, incidental or consequential damages including but not limited to lost profits, down time, lost production, or lost business opportunity arising directly or indirectly from the use of the machinery.' },
              { title: 'REFUSAL TO ACCEPT DELIVERY', text: 'In the event Purchaser unreasonably refuses to accept delivery, Seller may at its sole option (a) terminate this Agreement and retain all monies paid by Purchaser as liquidated damages, or (b) have the Machinery transported, warehoused and insured for pickup by Purchaser at Purchaser\'s expense and risk.' },
              { title: 'EXISTING TITLE TO MACHINERY', text: 'Purchaser acknowledges that title to and possession of Machinery described on the face of this Agreement may be held by another party contemplating a sale of such Machinery to Seller. Machinery may be sold hereunder subject to prior sale and Seller obtaining actual possession with free and clear title.' },
              { title: 'DELAY OF NONPERFORMANCE', text: 'Seller shall not be liable for failure to ship or delay in shipment, or failure or delay in other performance hereunder, if such failure or delay is due in whole or in part to strikes, work stoppage, fires, accidents, wars, rebellions, civil commotion, acts of any government, acts of public enemies, force majeure, inability to secure transportation, inability to obtain machinery, materials, or sufficient qualified labor, or any other causes beyond Seller\'s reasonable control.' },
              { title: 'ACCEPTANCE OF AGREEMENT/ENTIRE AGREEMENT', text: 'This Agreement sets forth the entire agreement and understanding between the parties concerning the subject matter hereof and supersedes all prior written or verbal discussions, representations and negotiations. Seller shall not be bound by any conditions, definitions, representations or warranties other than as expressly provided herein or set forth in writing signed by a duly authorized representative of Seller.' },
              {
                title: 'GENERAL TERMS', text: '(a) Assignment. There shall be no assignment of this Agreement by Purchaser, nor shall any amendment or other modification of this Agreement be effective without the express written consent of an authorized officer of Seller. (b) Applicable Law/Consent to Jurisdiction. This agreement shall be governed by the substantive internal laws of the State of Georgia. Any dispute shall be submitted to the American Arbitration Association for arbitration pursuant to such association\'s rules for commercial arbitration. (c) Binding on Successors and Assigns. This Agreement shall be binding upon the successors and legal representatives of the parties hereto. (d) Notices. All notices shall be in writing and sent by hand delivery, certified mail, or recognized overnight courier. (e) Waiver/Severability. Any failure by Seller to enforce any term shall not be construed as a waiver of Seller\'s right thereafter to enforce each and every term and condition. (f) Waiver/Trial by Jury. To the fullest extent permitted by law, purchaser and seller hereby waive trial by jury in any litigation arising out of this agreement.',
              },
            ].map(({ title, text }) => (
              <li key={title} style={{ marginBottom: '12px' }}>
                <span style={{ fontWeight: 700, textDecoration: 'underline', color: C.darkGray }}>{title}:</span>
                {' '}{text}
              </li>
            ))}
          </ol>
        </div>

        <div style={{ padding: '20px 56px 48px', fontSize: '12px', color: C.midGray, lineHeight: '1.75' }}>
          <p>Please note it is the customer&apos;s responsibility to equip themselves with sheet metal lifting systems suitable for the size and weight of the sheets in order to ensure the table is not subject to high impact during the loading and unloading process.</p>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 6 — PROJECT ACCEPTANCE
      ════════════════════════════════════════════ */}
      <div style={sectionBg}>
        <SectionHeading num="6" line1="PROJECT" line2="ACCEPTANCE" />

        <div style={{ padding: '0 56px 40px', fontSize: '13px', color: C.midGray, lineHeight: '1.75' }}>
          <p>If you elect to execute this agreement, please sign where noted below and forward to us for our signature along with a purchase order and 30% deposit. We will return a countersigned agreement for your records.</p>

          {/* Signature lines */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', marginTop: '40px' }}>
            {[
              { label: 'Authorized Signature — Purchaser', sub: quote.company },
              { label: 'Authorized Signature — Cutlite America, LLC', sub: 'Cutlite America, LLC' },
            ].map(({ label, sub }) => (
              <div key={label}>
                <div style={{ borderBottom: `1px solid ${C.darkGray}`, marginBottom: '8px', height: '40px' }} />
                <div style={{ fontSize: '11px', color: C.midGray }}>{label}</div>
                <div style={{ fontSize: '11px', color: C.lightGray, marginTop: '2px' }}>{sub}</div>
                <div style={{ borderBottom: `1px solid ${C.rule}`, marginTop: '20px', marginBottom: '8px', height: '32px' }} />
                <div style={{ fontSize: '11px', color: C.midGray }}>Date</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════ */}
      <div style={{ background: C.pageBg, padding: '16px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: C.lightGray }}>
        <span>Cutlite America, LLC · 1075 Windward Ridge Parkway, Suite 120, Alpharetta, GA 30005</span>
        <span>{quote.quoteNumber}</span>
      </div>
    </div>
  )
}
