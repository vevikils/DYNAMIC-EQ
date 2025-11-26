
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { EQBand, FrequencyPoint, EQPreset } from './types';
import { calculateOverallFrequencyResponse, generateSimulatedSpectrum } from './utils/audioProcessor';
import EQBandControl from './components/EQBandControl';
import FrequencyResponseGraph from './components/FrequencyResponseGraph';
import Slider from './components/Slider';
import { DEFAULT_BANDS, MIN_FREQ, MAX_FREQ, NUM_FREQUENCY_POINTS, NUM_SPECTRUM_POINTS, MASTER_GAIN_RANGE } from './constants';
import { loadPresetsFromLocalStorage, savePresetsToLocalStorage } from './utils/localStorageUtils';
import { PLUGIN_PROCESSOR_CPP, PLUGIN_PROCESSOR_H, PLUGIN_EDITOR_CPP, PLUGIN_EDITOR_H } from './utils/vstTemplates';

// --- CUSTOM LOGO COMPONENT ---
const Logo = () => (
  <div className="flex items-center gap-3 select-none pointer-events-auto group cursor-default">
    <div className="relative w-10 h-10 flex items-center justify-center">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-blue-500/30 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
      
      {/* Icon */}
      <svg viewBox="0 0 40 40" className="w-full h-full drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" fill="none" xmlns="http://www.w3.org/2000/svg">
         {/* Background shape */}
         <path d="M20 38C29.9411 38 38 29.9411 38 20C38 10.0589 29.9411 2 20 2C10.0589 2 2 10.0589 2 20C2 29.9411 10.0589 38 20 38Z" stroke="url(#logo_gradient_stroke)" strokeWidth="1.5" strokeOpacity="0.3" fill="url(#logo_bg_gradient)" fillOpacity="0.2"/>
         
         {/* Waveform V */}
         <path d="M10 18L16 28L24 12L30 22" stroke="url(#logo_gradient_main)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
         
         <defs>
           <linearGradient id="logo_bg_gradient" x1="20" y1="2" x2="20" y2="38" gradientUnits="userSpaceOnUse">
             <stop stopColor="#1e293b" stopOpacity="0"/>
             <stop offset="1" stopColor="#3b82f6" stopOpacity="0.3"/>
           </linearGradient>
           <linearGradient id="logo_gradient_stroke" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
             <stop stopColor="#60A5FA"/>
             <stop offset="1" stopColor="#A855F7"/>
           </linearGradient>
           <linearGradient id="logo_gradient_main" x1="10" y1="12" x2="30" y2="28" gradientUnits="userSpaceOnUse">
             <stop stopColor="#60A5FA"/>
             <stop offset="0.5" stopColor="#3B82F6"/>
             <stop offset="1" stopColor="#A855F7"/>
           </linearGradient>
         </defs>
      </svg>
    </div>
    
    <div className="flex flex-col justify-center leading-none">
       <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black tracking-tighter text-slate-100">VEVI</span>
          <span className="text-2xl font-light tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">EQ</span>
       </div>
       <div className="flex justify-between w-full">
         <span className="text-[9px] font-bold tracking-[0.25em] text-slate-500 uppercase ml-0.5 group-hover:text-blue-400 transition-colors">Professional</span>
       </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [bands, setBands] = useState<EQBand[]>(DEFAULT_BANDS);
  const [masterGain, setMasterGain] = useState<number>(0);
  const [analyzerSmoothing, setAnalyzerSmoothing] = useState<number>(0.5);
  const [showAnalyzer, setShowAnalyzer] = useState<boolean>(true);
  const [frequencyResponseData, setFrequencyResponseData] = useState<FrequencyPoint[]>([]);
  const [spectrumData, setSpectrumData] = useState<FrequencyPoint[]>([]);
  const [selectedBandId, setSelectedBandId] = useState<number | null>(null);
  const [hoveredBandId, setHoveredBandId] = useState<number | null>(null);
  const [bypass, setBypass] = useState<boolean>(false);

  // Preset management
  const [presets, setPresets] = useState<EQPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [currentPresetName, setCurrentPresetName] = useState('');

  // Download Simulation Modal
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // --- AUDIO SIMULATION LOOP ---
  // We use a ref to store the current spectrum to calculate smooth transitions in the animation loop
  const prevSpectrumRef = useRef<FrequencyPoint[]>([]);
  const animationFrameRef = useRef<number>(0);

  // Derived state for bypass and SOLO logic
  const effectiveBands = useMemo(() => {
    // 1. If Global Bypass is on, everything is disabled
    if (bypass) return bands.map(b => ({ ...b, enabled: false }));

    // 2. Check for Solo
    const anySolo = bands.some(b => b.solo);

    if (anySolo) {
      // If any band is soloed, only those bands are effective.
      // Non-soloed bands are disabled. 
      return bands.map(b => ({
        ...b,
        enabled: !!b.solo // If solo is true, enabled is true. If solo is false, enabled is false.
      }));
    }

    // 3. Normal operation
    return bands;
  }, [bands, bypass]);

  const effectiveMasterGain = bypass ? 0 : masterGain;

  // Use a ref for calculation inside the loop to avoid dependency staleness issues if we were to use just state
  // But since we trigger re-render on state change, standard flow is okay.
  // We compute dynamic physics inside the loop.

  useEffect(() => {
    const loop = () => {
      // 1. Generate Spectrum (RTA)
      const newSpectrum = generateSimulatedSpectrum(
        effectiveBands,
        effectiveMasterGain,
        MIN_FREQ,
        MAX_FREQ,
        NUM_SPECTRUM_POINTS,
        prevSpectrumRef.current,
        analyzerSmoothing
      );
      
      prevSpectrumRef.current = newSpectrum;
      setSpectrumData(newSpectrum);

      // 2. Calculate Dynamic EQ Physics
      // Modify band gains based on the spectrum level at their frequency
      const dynamicBands = effectiveBands.map(band => {
         if (!band.enabled || !band.isDynamic) return band;

         // Map frequency to spectrum index
         const logMin = Math.log10(MIN_FREQ);
         const logMax = Math.log10(MAX_FREQ);
         const logFreq = Math.log10(band.frequency);
         const fraction = (logFreq - logMin) / (logMax - logMin);
         const index = Math.max(0, Math.min(NUM_SPECTRUM_POINTS - 1, Math.floor(fraction * NUM_SPECTRUM_POINTS)));
         
         const level = newSpectrum[index]?.gain || -100;

         // Dynamic Physics:
         // Threshold around -50dB. 
         // If level > -50dB, apply reduction/expansion.
         // Normalize intensity (0.0 to 1.0) based on how loud it is (max 0dB)
         const intensity = Math.max(0, (level + 50) / 50); 
         
         // Max dynamic throw depends on user setting (default 6dB)
         const range = band.dynamicRange || 6; 
         const offset = intensity * range;

         let dynamicGain = band.gain;

         if (band.gain > 0) {
             // Boosting: Compress (reduce gain) on peaks
             dynamicGain = Math.max(0, band.gain - offset);
         } else if (band.gain < 0) {
             // Cutting: Expand (cut deeper) on peaks
             dynamicGain = band.gain - offset;
         }
         // If gain is 0, do nothing or maybe just jitter? Let's stay 0.

         return { ...band, gain: dynamicGain };
      });

      // 3. Calculate Curve using Dynamic Bands
      const newCurve = calculateOverallFrequencyResponse(
        dynamicBands,
        effectiveMasterGain,
        MIN_FREQ,
        MAX_FREQ,
        NUM_FREQUENCY_POINTS
      );
      
      setFrequencyResponseData(newCurve);
      
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [effectiveBands, effectiveMasterGain, analyzerSmoothing]); 

  // --- HANDLERS ---
  const handleBandChange = useCallback((id: number, updatedBand: Partial<EQBand>) => {
    setBands((prevBands) =>
      prevBands.map((band) =>
        band.id === id ? { ...band, ...updatedBand } : band
      )
    );
  }, []);

  const handleBandSelect = useCallback((id: number) => {
    setSelectedBandId(id);
  }, []);

  // Initialize presets
  useEffect(() => {
    const stored = loadPresetsFromLocalStorage();
    if (stored) setPresets(stored);
  }, []);
  useEffect(() => { savePresetsToLocalStorage(presets); }, [presets]);

  const savePreset = () => {
    if (!currentPresetName) return;
    setPresets([...presets, { id: Date.now().toString(), name: currentPresetName, bands, masterGain }]);
    setCurrentPresetName('');
    setShowPresets(false);
  };

  const loadPreset = (preset: EQPreset) => {
    setBands(preset.bands);
    setMasterGain(preset.masterGain);
    setShowPresets(false);
  };

  const handleDownloadSource = () => {
    const downloadFile = (filename: string, content: string) => {
      const element = document.createElement('a');
      const file = new Blob([content], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = filename;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    };

    downloadFile('PluginProcessor.h', PLUGIN_PROCESSOR_H);
    downloadFile('PluginProcessor.cpp', PLUGIN_PROCESSOR_CPP);
    downloadFile('PluginEditor.h', PLUGIN_EDITOR_H);
    downloadFile('PluginEditor.cpp', PLUGIN_EDITOR_CPP);
    
    alert('Started download of 4 source files. Please open JUCE Projucer to compile them.');
  };

  const selectedBand = useMemo(() => bands.find(b => b.id === selectedBandId), [bands, selectedBandId]);

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden flex flex-col relative">
      
      {/* HEADER */}
      <div className="absolute top-0 left-0 w-full z-20 flex justify-between items-center p-4 bg-gradient-to-b from-slate-900/90 to-transparent pointer-events-none">
        
        <Logo />
        
        {/* Top Right Controls */}
        <div className="flex items-center space-x-4 pointer-events-auto">
          
          {/* GitHub Link */}
          <a 
            href="https://github.com/vevikils/VeviMaster-IA" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-white transition-colors"
            title="View on GitHub"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
               <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
            </svg>
          </a>

          <div className="h-6 w-px bg-slate-700 mx-1"></div>

          {/* Download VST Button */}
          <button 
             onClick={() => setShowDownloadModal(true)}
             className="flex items-center space-x-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)]"
          >
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
             <span>Download VST3</span>
          </button>

          <div className="h-6 w-px bg-slate-700 mx-2"></div>

          <button 
            onClick={() => setShowPresets(!showPresets)}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-full border border-slate-700 text-xs font-medium transition-colors"
          >
            Presets
          </button>

          {/* Analyzer Toggle */}
          <button 
             onClick={() => setShowAnalyzer(!showAnalyzer)}
             className={`px-3 py-1 rounded-full border border-slate-700 text-xs font-medium transition-colors ${showAnalyzer ? 'bg-blue-600/30 text-blue-200 border-blue-500' : 'bg-slate-800 text-slate-400'}`}
          >
            Analyzer
          </button>

          {/* Smoothing Control */}
          <div className={`flex items-center space-x-2 bg-slate-800/80 rounded-full px-3 py-1 border border-slate-700 transition-opacity ${showAnalyzer ? 'opacity-100' : 'opacity-40 pointer-events-none'}`} title="Analyzer Smoothing">
             <span className="text-xs text-slate-400">Smooth</span>
             <input 
                type="range" min="0" max="0.95" step="0.05" 
                value={analyzerSmoothing} onChange={(e) => setAnalyzerSmoothing(parseFloat(e.target.value))}
                className="w-16 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer"
             />
          </div>
          
          {/* Master Gain */}
          <div className="flex items-center space-x-2 bg-slate-800/80 rounded-full px-3 py-1 border border-slate-700">
             <span className="text-xs text-slate-400">Output</span>
             <input 
                type="range" min="-12" max="12" step="0.1" 
                value={masterGain} onChange={(e) => setMasterGain(parseFloat(e.target.value))}
                className="w-16 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer"
             />
             <span className="text-xs font-mono w-8 text-right">{masterGain > 0 ? '+' : ''}{masterGain.toFixed(1)}</span>
          </div>

          {/* BYPASS BUTTON */}
          <button
            onClick={() => setBypass(!bypass)}
            className={`
              flex items-center justify-center w-10 h-10 rounded-full border transition-all duration-300 shadow-lg
              ${bypass 
                ? 'bg-red-500/20 border-red-500 text-red-500 shadow-red-500/50' 
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}
            `}
            title="Global Bypass"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" />
            </svg>
          </button>

        </div>
      </div>

      {/* MAIN GRAPH AREA */}
      <div className="flex-grow w-full relative z-10">
        {/* Click background to deselect */}
        <div className="absolute inset-0" onClick={() => setSelectedBandId(null)}></div>
        
        {/* Bypass Indicator Overlay */}
        {bypass && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
            <span className="text-red-500 font-bold tracking-widest text-4xl opacity-20 uppercase">Bypass</span>
          </div>
        )}

        <FrequencyResponseGraph 
          data={frequencyResponseData} 
          spectrumData={showAnalyzer ? spectrumData : []}
          bands={bands} // Pass REAL bands so handles stay visible/editable at user position
          selectedBandId={selectedBandId}
          onBandChange={handleBandChange}
          onBandSelect={handleBandSelect}
          onBandHover={setHoveredBandId}
        />
      </div>

      {/* FOOTER / CONTROLS */}
      <div className="absolute bottom-0 w-full z-30 pointer-events-none flex flex-col items-center pb-8">
        
        {/* Band Selection Strip (Mini indicators) */}
        <div className="flex space-x-2 mb-4 pointer-events-auto bg-slate-900/50 backdrop-blur-sm p-2 rounded-full border border-slate-800/50">
           {bands.map(b => (
             <button
               key={b.id}
               onClick={() => setSelectedBandId(b.id)}
               className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all border relative
                 ${selectedBandId === b.id 
                    ? 'scale-110 ring-2 ring-white border-transparent' 
                    : (hoveredBandId === b.id ? 'border-white scale-110' : 'opacity-70 border-transparent hover:opacity-100 hover:border-slate-500')}
               `}
               style={{ backgroundColor: b.enabled ? b.color : '#334155', color: b.enabled ? '#fff' : '#94a3b8' }}
             >
               {b.id}
               {/* Solo Dot Indicator */}
               {b.solo && (
                 <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                 </span>
               )}
             </button>
           ))}
        </div>

        {/* Selected Band Inspector */}
        {selectedBand && (
           <div className="pointer-events-auto">
             <EQBandControl band={selectedBand} onBandChange={handleBandChange} />
           </div>
        )}
      </div>

      {/* PRESETS MODAL */}
      {showPresets && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Presets</h2>
            <div className="flex space-x-2 mb-4">
               <input 
                 value={currentPresetName} onChange={e => setCurrentPresetName(e.target.value)}
                 className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                 placeholder="New Preset Name"
               />
               <button onClick={savePreset} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-bold">Save</button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {presets.map(p => (
                <div key={p.id} className="flex justify-between items-center p-2 hover:bg-slate-800 rounded group cursor-pointer" onClick={() => loadPreset(p)}>
                  <span>{p.name}</span>
                  <div className="flex space-x-2">
                    <span className="text-xs text-slate-500 opacity-0 group-hover:opacity-100">Load</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPresets(presets.filter(pr => pr.id !== p.id)); }}
                      className="text-xs text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-400"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
              {presets.length === 0 && <p className="text-slate-500 text-sm">No presets saved.</p>}
            </div>
            <button onClick={() => setShowPresets(false)} className="mt-4 text-slate-400 hover:text-white text-sm w-full text-center">Close</button>
          </div>
        </div>
      )}

      {/* DOWNLOAD MODAL */}
      {showDownloadModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl max-w-lg w-full p-6 relative animate-fade-in-up">
            <div className="flex items-start justify-between mb-4">
               <div className="flex items-center gap-2">
                 <div className="bg-blue-600 p-2 rounded-lg">
                   <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                 </div>
                 <div>
                   <h2 className="text-xl font-bold text-white">Export VST3</h2>
                   <p className="text-xs text-slate-400">Target: FL Studio (Windows/Mac)</p>
                 </div>
               </div>
               <button onClick={() => setShowDownloadModal(false)} className="text-slate-500 hover:text-white">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
               </button>
            </div>
            
            <div className="space-y-4">
               <div className="p-3 bg-red-900/30 border border-red-700/50 rounded text-sm text-red-200">
                  <strong>Fixing 'juce' Errors:</strong> The errors you see ("'juce': no es un nombre de clase") occur because the C++ compiler cannot find the JUCE framework on your computer.
               </div>
               
               <ol className="list-decimal list-inside text-xs text-slate-300 space-y-2 marker:text-blue-500">
                  <li>Download and install <strong>JUCE Projucer</strong>.</li>
                  <li>Open Projucer -> New Project -> <strong>Plug-in</strong> -> Basic.</li>
                  <li>Name it <strong>VeviEqPro</strong>. Save it to a folder.</li>
                  <li>Go to the folder, open <strong>Source</strong> directory.</li>
                  <li>Replace the files with the source code downloaded below.</li>
                  <li>Open the project in your IDE (Visual Studio / Xcode) via Projucer and Build.</li>
               </ol>

               <div className="pt-2">
                 <a 
                   href="https://github.com/vevikils/VeviMaster-IA"
                   target="_blank"
                   rel="noopener noreferrer"
                   className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 underline"
                 >
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/></svg>
                   Visit Official Repository on GitHub
                 </a>
               </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
               <button onClick={handleDownloadSource} className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white py-3 rounded-lg font-bold shadow-lg transition-all text-sm flex items-center justify-center gap-2">
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                 Download C++ Source (.cpp / .h)
               </button>
               <button onClick={() => setShowDownloadModal(false)} className="text-slate-500 hover:text-white py-2 text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
      
      {/* DISCLAIMER */}
      <div className="absolute bottom-1 right-2 z-50 pointer-events-none">
        <p className="text-[10px] text-slate-600 opacity-50">VEVI EQ Pro (UI Demo) - Not a real VST</p>
      </div>

    </div>
  );
};

export default App;
