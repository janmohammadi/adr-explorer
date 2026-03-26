import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ADR, ADRStatus } from './types';

interface GraphViewProps {
  adrs: ADR[];
}

const STATUS_COLORS: Record<ADRStatus, string> = {
  PROPOSED: '#f27d26',
  ACCEPTED: '#3b82f6',
  SUPERSEDED: '#ef4444',
};

export const GraphView: React.FC<GraphViewProps> = ({ adrs }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Simulation and elements refs to update them without re-creating the graph
  const simulationRef = useRef<d3.Simulation<any, undefined> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initial Graph Creation
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Define markers for arrows
    svg.append("defs").selectAll("marker")
      .data(["arrow-default", "arrow-selected"])
      .join("marker")
      .attr("id", d => d)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 28)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", d => d === "arrow-selected" ? "#fff" : "#666")
      .attr("d", "M0,-5L10,0L0,5");

    const nodes = adrs.map(d => ({ ...d }));
    const links: any[] = [];

    adrs.forEach(adr => {
      if (adr.links) {
        adr.links.forEach(link => {
          const target = nodes.find(n => n.id === link.target);
          if (target) {
            links.push({
              source: adr.id,
              target: link.target,
              type: link.type
            });
          }
        });
      }
    });

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    simulationRef.current = simulation;

    const g = svg.append("g").attr("class", "main-group");

    // Zoom behavior
    const zoom = d3.zoom().on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

    svg.call(zoom as any);

    // Links
    const link = g.append("g")
      .attr("class", "links-group")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "adr-link")
      .attr("stroke-dasharray", "5,5")
      .style("transition", "stroke 0.2s, stroke-width 0.2s, stroke-opacity 0.2s");

    // Add CSS for dash animation
    svg.append("style").text(`
      @keyframes dash {
        to {
          stroke-dashoffset: -10;
        }
      }
    `);

    // Link labels
    const linkText = g.append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .attr("font-size", "9px")
      .attr("fill", "#666")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .style("pointer-events", "none")
      .text(d => d.type);

    // Nodes
    const node = g.append("g")
      .attr("class", "nodes-group")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "adr-node")
      .attr("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedNodeId(prev => prev === d.id ? null : d.id);
      })
      .on("mouseenter", (event, d) => setHoveredNodeId(d.id))
      .on("mouseleave", () => setHoveredNodeId(null))
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    node.append("circle")
      .attr("r", 14)
      .attr("fill", d => STATUS_COLORS[d.status as ADRStatus])
      .style("transition", "stroke 0.2s, stroke-width 0.2s, filter 0.2s");

    node.append("text")
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "white")
      .attr("font-weight", "bold")
      .style("pointer-events", "none")
      .text(d => d.id);

    node.append("text")
      .attr("dx", 20)
      .attr("dy", "0.35em")
      .attr("font-size", "11px")
      .attr("fill", "#ccc")
      .text(d => d.title)
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkText
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    svg.on("click", () => setSelectedNodeId(null));

    return () => {
      simulation.stop();
    };
  }, [adrs, dimensions]);

  // Update styles on selection/hover without re-creating the graph
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    // Update Links
    svg.selectAll<SVGLineElement, any>(".adr-link")
      .each(function(d) {
        const isActive = d.source.id === selectedNodeId || d.target.id === selectedNodeId || 
                         d.source.id === hoveredNodeId || d.target.id === hoveredNodeId;
        
        d3.select(this)
          .attr("stroke", isActive ? "#fff" : "#444")
          .attr("stroke-opacity", isActive ? 1 : 0.4)
          .attr("stroke-width", isActive ? 2 : 1)
          .attr("marker-end", isActive ? "url(#arrow-selected)" : "url(#arrow-default)")
          .style("animation", isActive ? "dash 1s linear infinite" : "none");
      });

    // Update Nodes
    svg.selectAll<SVGGElement, any>(".adr-node")
      .each(function(d) {
        const isFocused = d.id === selectedNodeId || d.id === hoveredNodeId;
        
        d3.select(this).select("circle")
          .attr("stroke", isFocused ? "#fff" : "#1a1b1e")
          .attr("stroke-width", isFocused ? 3 : 2)
          .style("filter", isFocused ? "drop-shadow(0 0 8px rgba(255,255,255,0.4))" : "none");
      });

  }, [selectedNodeId, hoveredNodeId]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-panel-dark grid-background">
      <div className="absolute top-4 left-4 flex items-center gap-2 text-xs font-mono text-gray-500 z-10 pointer-events-none">
        <div className="w-3 h-3 border border-gray-700 flex items-center justify-center">
          <div className="w-1 h-1 bg-gray-700"></div>
        </div>
        ADR Graph
      </div>
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};
