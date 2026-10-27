// components/ServiceOrder/PatternLockCanvas.jsx
// Grade 3x3 de padrão de desbloqueio estilo Android
// Suporta mouse, touch com bloqueio de scroll, replay visual e responsividade.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';

const GRID_SIZE = 3;
const TOTAL_POINTS = 9;

// Coordenadas relativas percentuais (0 a 100) para os 9 pontos (1 a 9)
const POINT_COORDS = [
  { id: 1, x: 20, y: 20 },
  { id: 2, x: 50, y: 20 },
  { id: 3, x: 80, y: 20 },
  { id: 4, x: 20, y: 50 },
  { id: 5, x: 50, y: 50 },
  { id: 6, x: 80, y: 50 },
  { id: 7, x: 20, y: 80 },
  { id: 8, x: 50, y: 80 },
  { id: 9, x: 80, y: 80 },
];

export default function PatternLockCanvas({
  value = '',
  onChange,
  readOnly = false,
  size = 260,
  showClearButton = true,
}) {
  const containerRef = useRef(null);
  const [selectedPoints, setSelectedPoints] = useState(() => {
    if (!value) return [];
    return String(value)
      .split('-')
      .map(Number)
      .filter((n) => n >= 1 && n <= TOTAL_POINTS);
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentCoord, setCurrentCoord] = useState(null);

  // Sincroniza com prop externa quando alterada (ex: carregamento da OS)
  useEffect(() => {
    if (!isDrawing) {
      if (!value) {
        setSelectedPoints([]);
      } else {
        const parsed = String(value)
          .split('-')
          .map(Number)
          .filter((n) => n >= 1 && n <= TOTAL_POINTS);
        setSelectedPoints(parsed);
      }
    }
  }, [value, isDrawing]);

  // Converte ponto de evento (mouse ou touch) em coordenadas relativas percentuais (0-100)
  const getRelativeCoord = useCallback((clientX, clientY) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x, y };
  }, []);

  // Verifica se a coordenada está próxima de um ponto da grade (raio de tolerância)
  const findCollidingPoint = useCallback((coord) => {
    if (!coord) return null;
    const HIT_RADIUS = 12; // 12% da largura/altura do container
    for (const pt of POINT_COORDS) {
      const dx = pt.x - coord.x;
      const dy = pt.y - coord.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= HIT_RADIUS) {
        return pt.id;
      }
    }
    return null;
  }, []);

  const handleStart = (clientX, clientY) => {
    if (readOnly) return;
    const coord = getRelativeCoord(clientX, clientY);
    if (!coord) return;

    const hit = findCollidingPoint(coord);
    setIsDrawing(true);
    setCurrentCoord(coord);

    if (hit) {
      const newSequence = [hit];
      setSelectedPoints(newSequence);
      if (onChange) onChange(newSequence.join('-'));
    } else {
      setSelectedPoints([]);
      if (onChange) onChange('');
    }
  };

  const handleMove = (clientX, clientY) => {
    if (!isDrawing || readOnly) return;
    const coord = getRelativeCoord(clientX, clientY);
    if (!coord) return;

    setCurrentCoord(coord);
    const hit = findCollidingPoint(coord);
    if (hit && !selectedPoints.includes(hit)) {
      const nextSequence = [...selectedPoints, hit];
      setSelectedPoints(nextSequence);
      if (onChange) onChange(nextSequence.join('-'));
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setCurrentCoord(null);
    if (onChange) {
      onChange(selectedPoints.length > 0 ? selectedPoints.join('-') : '');
    }
  };

  // Listeners de touch para garantir que o scroll da tela seja prevenido estritamente durante o gesto
  useEffect(() => {
    const el = containerRef.current;
    if (!el || readOnly) return;

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        handleStart(touch.clientX, touch.clientY);
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      handleEnd();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [readOnly, isDrawing, selectedPoints, handleStart, handleMove, handleEnd]);

  // Mouse global listeners para suportar arraste fora da caixa
  useEffect(() => {
    if (!isDrawing || readOnly) return;

    const onMouseMove = (e) => {
      handleMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      handleEnd();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDrawing, readOnly, handleMove, handleEnd]);

  const handleClear = () => {
    setSelectedPoints([]);
    setCurrentCoord(null);
    setIsDrawing(false);
    if (onChange) onChange('');
  };

  return (
    <div className="flex flex-col items-center select-none">
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          if (e.button === 0) handleStart(e.clientX, e.clientY);
        }}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          touchAction: 'none',
        }}
        className={`relative rounded-2xl border transition-colors ${
          readOnly
            ? 'border-white/10 bg-slate-900/60 dark:bg-black/40'
            : isDrawing
              ? 'border-brand-500/70 bg-slate-900/80 shadow-lg shadow-brand-500/10 dark:bg-black/60 cursor-crosshair'
              : 'border-slate-200 dark:border-white/10 bg-slate-900/70 dark:bg-black/50 cursor-pointer hover:border-brand-500/40'
        }`}
      >
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Linhas ligando os pontos já conectados */}
          {selectedPoints.map((ptId, index) => {
            if (index === 0) return null;
            const prevPt = POINT_COORDS.find((p) => p.id === selectedPoints[index - 1]);
            const currPt = POINT_COORDS.find((p) => p.id === ptId);
            if (!prevPt || !currPt) return null;

            return (
              <line
                key={`line-${index}`}
                x1={prevPt.x}
                y1={prevPt.y}
                x2={currPt.x}
                y2={currPt.y}
                stroke="#FFC806"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />
            );
          })}

          {/* Linha dinâmica entre o último ponto selecionado e o cursor/touch em movimento */}
          {isDrawing && currentCoord && selectedPoints.length > 0 && (
            (() => {
              const lastPt = POINT_COORDS.find(
                (p) => p.id === selectedPoints[selectedPoints.length - 1]
              );
              if (!lastPt) return null;
              return (
                <line
                  x1={lastPt.x}
                  y1={lastPt.y}
                  x2={currentCoord.x}
                  y2={currentCoord.y}
                  stroke="#FFC806"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="4 3"
                  strokeOpacity="0.75"
                />
              );
            })()
          )}

          {/* Círculos e nós dos 9 pontos */}
          {POINT_COORDS.map((pt) => {
            const isSelected = selectedPoints.includes(pt.id);
            const isLast = selectedPoints[selectedPoints.length - 1] === pt.id;
            const orderIndex = selectedPoints.indexOf(pt.id);

            return (
              <g key={`pt-${pt.id}`}>
                {/* Halo exterior quando selecionado */}
                {isSelected && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8.5"
                    fill="#FFC806"
                    fillOpacity={isLast ? '0.35' : '0.2'}
                    className="transition-all duration-150"
                  />
                )}

                {/* Círculo do ponto */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? '4.8' : '3.6'}
                  fill={isSelected ? '#FFC806' : '#94a3b8'}
                  stroke={isSelected ? '#ffffff' : '#475569'}
                  strokeWidth={isSelected ? '1.2' : '0.8'}
                  className="transition-all duration-150"
                />

                {/* Número da ordem de passagem (pequeno indicativo elegante) */}
                {isSelected && (
                  <text
                    x={pt.x}
                    y={pt.y + 1.2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#18181b"
                    fontSize="3.6"
                    fontWeight="bold"
                  >
                    {orderIndex + 1}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Rodapé interativo com contagem e botão Limpar */}
      {!readOnly && (
        <div className="mt-2.5 flex items-center justify-between w-full max-w-[260px] px-1 text-xs">
          <span className="text-slate-400">
            {selectedPoints.length === 0
              ? 'Arraste para desenhar'
              : `${selectedPoints.length} ponto${selectedPoints.length > 1 ? 's' : ''} conectado${selectedPoints.length > 1 ? 's' : ''}`}
          </span>

          {showClearButton && selectedPoints.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-500 hover:text-amber-400 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
            >
              <RotateCcw size={12} /> Limpar padrão
            </button>
          )}
        </div>
      )}
    </div>
  );
}
