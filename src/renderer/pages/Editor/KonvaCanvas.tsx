import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Field, Template } from '../../../shared/types/index.js';

interface KonvaCanvasProps {
  template: Template;
  backgroundDataUrl: string;
  selectedFieldId: string | null;
  zoom: number;
  showGrid: boolean;
  onSelect(id: string | null): void;
  onChange(field: Field): void;
}

interface CanvasSize {
  width: number;
  height: number;
}

const GRID_STEP = 20;
const SNAP_STEP = 5;

export function KonvaCanvas({
  template,
  backgroundDataUrl,
  selectedFieldId,
  zoom,
  showGrid,
  onSelect,
  onChange,
}: KonvaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);
  const image = useHtmlImage(backgroundDataUrl);
  const { width, height } = template.background;
  const fitScale = Math.min(
    Math.max(0.08, (size.width - 72) / width),
    Math.max(0.08, (size.height - 72) / height),
    1.4,
  );
  const scale = fitScale * zoom;
  const stageWidth = Math.max(1, width * scale);
  const stageHeight = Math.max(1, height * scale);

  const gridLines = useMemo(() => {
    if (!showGrid) {
      return [];
    }
    const lines: Array<{ key: string; points: number[] }> = [];
    for (let x = GRID_STEP; x < width; x += GRID_STEP) {
      lines.push({ key: `x-${x}`, points: [x, 0, x, height] });
    }
    for (let y = GRID_STEP; y < height; y += GRID_STEP) {
      lines.push({ key: `y-${y}`, points: [0, y, width, y] });
    }
    return lines;
  }, [height, showGrid, width]);

  return (
    <div ref={containerRef} className="canvas-viewport">
      <div
        className="canvas-stage-wrap"
        style={{ width: stageWidth, height: stageHeight }}
      >
        <Stage
          width={stageWidth}
          height={stageHeight}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage()) {
              onSelect(null);
            }
          }}
        >
          <Layer scaleX={scale} scaleY={scale}>
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="#ffffff"
              shadowColor="#1b2d24"
              shadowBlur={24 / scale}
              shadowOpacity={0.12}
              shadowOffsetY={8 / scale}
              listening={false}
            />
            {image && (
              <KonvaImage
                image={image}
                x={0}
                y={0}
                width={width}
                height={height}
                listening={false}
              />
            )}
            {gridLines.map((line) => (
              <Line
                key={line.key}
                points={line.points}
                stroke="rgba(13, 156, 91, 0.13)"
                strokeWidth={1 / scale}
                listening={false}
              />
            ))}
            {template.fields
              .slice()
              .sort((left, right) => left.zIndex - right.zIndex)
              .map((field) => (
                <FieldNode
                  key={field.id}
                  field={field}
                  selected={field.id === selectedFieldId}
                  scale={scale}
                  onSelect={() => onSelect(field.id)}
                  onChange={onChange}
                />
              ))}
          </Layer>
        </Stage>
      </div>
      <div className="canvas-size-label">
        {width} × {height} px
      </div>
    </div>
  );
}

interface FieldNodeProps {
  field: Field;
  selected: boolean;
  scale: number;
  onSelect(): void;
  onChange(field: Field): void;
}

function FieldNode({
  field,
  selected,
  scale,
  onSelect,
  onChange,
}: FieldNodeProps) {
  const shapeRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const color = field.type === 'text' ? '#0D9C5B' : '#2D6CDF';

  useEffect(() => {
    if (selected && shapeRef.current && transformerRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const finishDrag = (event: KonvaEventObject<DragEvent>) => {
    onChange({
      ...field,
      rect: {
        ...field.rect,
        x: snap(event.target.x()),
        y: snap(event.target.y()),
      },
    });
  };

  const finishTransform = () => {
    const node = shapeRef.current;
    if (!node) {
      return;
    }

    const width = Math.max(24, snap(node.width() * node.scaleX()));
    const height = Math.max(24, snap(node.height() * node.scaleY()));
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      ...field,
      rect: {
        x: snap(node.x()),
        y: snap(node.y()),
        width,
        height,
      },
    });
  };

  return (
    <>
      <Rect
        ref={shapeRef}
        x={field.rect.x}
        y={field.rect.y}
        width={field.rect.width}
        height={field.rect.height}
        fill={`${color}18`}
        stroke={color}
        strokeWidth={(selected ? 2 : 1.3) / scale}
        {...(selected ? {} : { dash: [7 / scale, 5 / scale] })}
        cornerRadius={5 / scale}
        draggable
        onMouseDown={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={onSelect}
        onDragEnd={finishDrag}
        onTransformEnd={finishTransform}
      />
      <Text
        x={field.rect.x + 8 / scale}
        y={field.rect.y + 7 / scale}
        text={field.type === 'text' ? `T  ${field.name}` : `QR  ${field.name}`}
        fontFamily="Arial"
        fontStyle="bold"
        fontSize={12 / scale}
        fill={color}
        listening={false}
      />
      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          flipEnabled={false}
          anchorSize={9 / scale}
          anchorCornerRadius={2 / scale}
          borderStroke={color}
          borderStrokeWidth={1.4 / scale}
          anchorFill="#ffffff"
          anchorStroke={color}
          anchorStrokeWidth={1.4 / scale}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 24 || newBox.height < 24 ? oldBox : newBox
          }
        />
      )}
    </>
  );
}

function snap(value: number): number {
  return Math.round(value / SNAP_STEP) * SNAP_STEP;
}

function useHtmlImage(source: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = source;
    return () => {
      next.onload = null;
    };
  }, [source]);

  return image;
}

function useContainerSize(
  ref: React.RefObject<HTMLDivElement | null>,
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({
    width: 960,
    height: 680,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
