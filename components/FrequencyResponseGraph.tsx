
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { FrequencyPoint, EQBand } from '../types';
import { MIN_FREQ, MAX_FREQ, MIN_GAIN, MAX_GAIN, MIN_Q, MAX_Q } from '../constants';

interface FrequencyResponseGraphProps {
  data: FrequencyPoint[];
  spectrumData?: FrequencyPoint[];
  bands: EQBand[];
  selectedBandId: number | null;
  onBandChange: (id: number, updatedBand: Partial<EQBand>) => void;
  onBandSelect: (id: number) => void;
  onBandHover?: (id: number | null) => void;
}

const FrequencyResponseGraph: React.FC<FrequencyResponseGraphProps> = ({
  data,
  spectrumData,
  bands,
  selectedBandId,
  onBandChange,
  onBandSelect,
  onBandHover,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };

  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current?.parentElement) {
        setDimensions({
          width: svgRef.current.parentElement.clientWidth,
          height: svgRef.current.parentElement.clientHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!data.length || !svgRef.current) return;

    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    
    // Define Gradients and Masks
    let defs = svg.select('defs');
    if (defs.empty()) {
      defs = svg.append('defs');
      
      // Gradient for the EQ curve fill
      const curveGradient = defs.append('linearGradient')
        .attr('id', 'curve-fill-gradient')
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '0%').attr('y2', '100%');
      curveGradient.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(59, 130, 246, 0.2)');
      curveGradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(59, 130, 246, 0.0)');

      // Gradient for Spectrum
      const spectrumGradient = defs.append('linearGradient')
        .attr('id', 'spectrum-gradient')
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '0%').attr('y2', '100%');
      spectrumGradient.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(209, 213, 219, 0.4)');
      spectrumGradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(75, 85, 99, 0.1)');
    }

    let g = svg.select<SVGGElement>('g.main-group');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'main-group');
    }
    g.attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLog()
      .domain([MIN_FREQ, MAX_FREQ])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([MIN_GAIN, MAX_GAIN])
      .range([height, 0]);

    // --- GRID & AXES ---
    // Custom Grid Rendering for that "Pro Plugin" look
    const freqTicks = [30, 60, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const gainTicks = [-24, -18, -12, -6, 0, 6, 12, 18, 24];

    // X Grid
    const xGrid = g.selectAll<SVGLineElement, number>('.x-grid')
      .data(freqTicks, d => d);
    xGrid.enter().append('line')
      .attr('class', 'x-grid')
      .attr('stroke', '#374151') // gray-700
      .attr('stroke-width', 1)
      .merge(xGrid)
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', height);
    xGrid.exit().remove();

    // Y Grid
    const yGrid = g.selectAll<SVGLineElement, number>('.y-grid')
      .data(gainTicks, d => d);
    yGrid.enter().append('line')
      .attr('class', 'y-grid')
      .attr('stroke', '#374151')
      .attr('stroke-width', 1)
      .merge(yGrid)
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d));
    yGrid.exit().remove();

    // Zero Line (Brighter)
    let zeroLine = g.select<SVGLineElement>('.zero-line');
    if (zeroLine.empty()) zeroLine = g.append('line').attr('class', 'zero-line');
    zeroLine
      .attr('x1', 0).attr('x2', width)
      .attr('y1', yScale(0)).attr('y2', yScale(0))
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.5);

    // Labels
    const xLabels = g.selectAll<SVGTextElement, number>('.x-label')
      .data(freqTicks, d => d);
    xLabels.enter().append('text').attr('class', 'x-label')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')
      .attr('dy', '15px')
      .merge(xLabels)
      .attr('x', d => xScale(d))
      .attr('y', height)
      .text(d => d >= 1000 ? `${d/1000}k` : d);
    xLabels.exit().remove();

    // --- SPECTRUM ANALYZER ---
    // Render spectrum behind the EQ curve
    if (spectrumData && spectrumData.length > 0) {
      // Area (Fill)
      const spectrumArea = d3.area<FrequencyPoint>()
        .x(d => xScale(d.frequency))
        .y0(height) // Bottom of graph
        .y1(d => yScale(d.gain))
        .curve(d3.curveBasis); // Smooth the random noise slightly

      let specPath = g.select<SVGPathElement>('.spectrum-path');
      if (specPath.empty()) {
        specPath = g.append('path').attr('class', 'spectrum-path');
      }
      specPath
        .datum(spectrumData)
        .attr('d', spectrumArea)
        .attr('fill', 'url(#spectrum-gradient)')
        .attr('opacity', 0.8);

      // Line (Stroke)
      const spectrumLine = d3.line<FrequencyPoint>()
        .x(d => xScale(d.frequency))
        .y(d => yScale(d.gain))
        .curve(d3.curveBasis);

      let specLinePath = g.select<SVGPathElement>('.spectrum-line');
      if (specLinePath.empty()) {
        specLinePath = g.append('path').attr('class', 'spectrum-line');
      }
      specLinePath
        .datum(spectrumData)
        .attr('d', spectrumLine)
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af') // gray-400
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

    } else {
        g.select('.spectrum-path').remove();
        g.select('.spectrum-line').remove();
    }

    // --- EQ CURVE ---
    const line = d3.line<FrequencyPoint>()
      .x(d => xScale(d.frequency))
      .y(d => yScale(d.gain))
      .curve(d3.curveBasis);

    const area = d3.area<FrequencyPoint>()
      .x(d => xScale(d.frequency))
      .y0(height) // Or yScale(0) for different fill style
      .y1(d => yScale(d.gain))
      .curve(d3.curveBasis);

    // Fill under curve
    let curveAreaPath = g.select<SVGPathElement>('.curve-area');
    if (curveAreaPath.empty()) curveAreaPath = g.append('path').attr('class', 'curve-area');
    curveAreaPath
      .datum(data)
      .attr('d', area)
      .attr('fill', 'url(#curve-fill-gradient)')
      .attr('opacity', 0.6);

    // Main Curve Line
    let curvePath = g.select<SVGPathElement>('.curve-line');
    if (curvePath.empty()) curvePath = g.append('path').attr('class', 'curve-line');
    curvePath
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', '#60a5fa') // blue-400
      .attr('stroke-width', 2.5)
      .style('filter', 'drop-shadow(0 0 4px rgba(96, 165, 250, 0.5))'); // Glow effect

    // --- INTERACTIVE HANDLES ---
    // We use the same Drag logic, updated for the new styling
    const drag = d3.drag<SVGGElement, EQBand>()
      .subject(function(event, d) { return { x: xScale(d.frequency), y: yScale(d.gain) }; })
      .on('start', function(event, d) {
        onBandSelect(d.id);
        d3.select(this).raise(); // Bring to front
      })
      .on('drag', function(event, d) {
        // Calculate new values from mouse position
        // We use d3.pointer relative to the graph group 'g'
        const [x, y] = d3.pointer(event, g.node());
        
        let newFreq = xScale.invert(x);
        let newGain = yScale.invert(y);

        // Constraint
        newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, newFreq));
        newGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, newGain));

        onBandChange(d.id, { frequency: newFreq, gain: newGain });
      });

    // We use groups 'g' for handles to potentially add text or outer rings
    const handles = g.selectAll<SVGGElement, EQBand>('.band-handle')
      .data(bands.filter(b => b.enabled), d => d.id);

    const handlesEnter = handles.enter().append('g')
      .attr('class', 'band-handle')
      .style('cursor', 'grab')
      .call(drag)
      .on('mouseenter', (event, d) => {
        if (onBandHover) onBandHover(d.id);
      })
      .on('mouseleave', (event, d) => {
        if (onBandHover) onBandHover(null);
      })
      // Mouse Wheel to adjust Q
      .on('wheel', function(event, d) {
        event.preventDefault();
        event.stopPropagation();
        
        // Negative deltaY (scrolling up) typically means zoom in / narrow width / Increase Q
        // Positive deltaY (scrolling down) typically means zoom out / wider width / Decrease Q
        const direction = event.deltaY < 0 ? 1 : -1;
        const step = 0.5; // Adjust speed of Q change

        let newQ = d.q + (direction * step);
        newQ = Math.max(MIN_Q, Math.min(MAX_Q, newQ));

        onBandChange(d.id, { q: newQ });
      });

    // 1. Q Width Indicator (Backmost)
    // Horizontal line indicating bandwidth (inverse of Q)
    handlesEnter.append('line')
      .attr('class', 'q-indicator')
      .attr('stroke-linecap', 'round')
      .style('pointer-events', 'none');

    // 2. Outer Glow/Ring for selection
    handlesEnter.append('circle')
      .attr('class', 'outer-ring')
      .attr('r', 14)
      .attr('fill', 'transparent')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0);

    // 3. Dynamic Mode Indicator (Dashed ring)
    handlesEnter.append('circle')
      .attr('class', 'dynamic-ring')
      .attr('r', 18)
      .attr('fill', 'transparent')
      .attr('stroke', 'rgba(255, 255, 255, 0.5)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0);

    // 4. Inner Color Circle
    handlesEnter.append('circle')
      .attr('class', 'inner-circle')
      .attr('r', 6)
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // 5. Number Label inside
    handlesEnter.append('text')
      .attr('class', 'band-number')
      .attr('text-anchor', 'middle')
      .attr('dy', '-10px')
      .attr('fill', 'white')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .style('pointer-events', 'none') // Let drag pass through
      .text(d => d.id);

    // MERGE Updates
    const handlesMerge = handlesEnter.merge(handles);
    
    handlesMerge
      .attr('transform', d => {
        return `translate(${xScale(d.frequency)}, ${yScale(d.gain)})`;
      });

    // Update Q Indicator
    handlesMerge.select('.q-indicator')
      .attr('x1', d => {
        // Calculate visual width pixels based on Q
        // Reference: 1 octave width in pixels
        const octavePx = xScale(2000) - xScale(1000);
        // Bandwidth is roughly 1/Q octaves. 
        // We multiply by a factor (e.g., 0.7) to get a nice visual length that isn't too overpowering.
        const w = (octavePx / Math.max(0.1, d.q)) * 0.7; 
        return -w;
      })
      .attr('x2', d => {
        const octavePx = xScale(2000) - xScale(1000);
        const w = (octavePx / Math.max(0.1, d.q)) * 0.7;
        return w;
      })
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.id === selectedBandId ? 5 : 3)
      .attr('opacity', d => d.id === selectedBandId ? 0.6 : 0.25);

    handlesMerge.select('.inner-circle')
      .attr('fill', d => d.color);

    handlesMerge.select('.outer-ring')
      .attr('opacity', d => d.id === selectedBandId ? 0.6 : 0)
      .attr('stroke', d => d.color);

    handlesMerge.select('.dynamic-ring')
      .attr('opacity', d => d.isDynamic ? 0.8 : 0)
      .attr('stroke', d => d.color)
      .attr('class', d => d.isDynamic ? 'dynamic-ring animate-spin-slow' : 'dynamic-ring'); 

    handles.exit().remove();

  }, [data, spectrumData, bands, selectedBandId, dimensions, margin.left, margin.top, onBandChange, onBandSelect, onBandHover]);

  return (
    <div className="w-full h-full relative select-none">
      <svg ref={svgRef} className="w-full h-full bg-slate-900 rounded-lg shadow-2xl overflow-hidden"></svg>
    </div>
  );
};

export default FrequencyResponseGraph;
