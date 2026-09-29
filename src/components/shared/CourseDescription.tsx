// src/components/shared/CourseDescription.tsx
import React from 'react';
import { ChevronDown } from 'lucide-react';

// Only surface the Read more toggle for descriptions long enough to actually
// be clipped. A character threshold stands in for measuring rendered overflow,
// which would otherwise need a ref plus a layout pass on every card render.
const DESCRIPTION_CLAMP_CHARS = 150;

export interface CourseDescriptionProps {
  courseId: number;
  description: string;
  expanded: boolean;
  onToggle: (courseId: number) => void;
  className?: string;
}

/**
 * Course description with a Read more / Show less toggle (DEF-001).
 *
 * Long descriptions are clamped to a few lines so a grid of cards stays
 * readable; the toggle reveals the rest in full. Expansion state is owned by
 * the caller (one expanded card at a time) and is keyed by course id, so the
 * same component serves the learner dashboard and the public course catalogue.
 */
export const CourseDescription: React.FC<CourseDescriptionProps> = ({
  courseId,
  description,
  expanded,
  onToggle,
  className = '',
}) => {
  const text = description?.trim() ?? '';
  if (text.length === 0) return null;

  const collapsible = text.length > DESCRIPTION_CLAMP_CHARS;

  return (
    <div className={className}>
      <p className={`text-[11.5px] text-ink-2 leading-relaxed ${collapsible && !expanded ? 'line-clamp-3' : ''}`}>
        {text}
      </p>
      {collapsible && (
        <button
          type="button"
          onClick={(e) => {
            // On the dashboard the card is itself a click target that opens the
            // course, so without this the toggle navigates away instead.
            e.stopPropagation();
            onToggle(courseId);
          }}
          aria-expanded={expanded}
          className="text-[11px] font-semibold text-ochre hover:underline mt-0.5 cursor-pointer inline-flex items-center gap-1"
        >
          {expanded ? 'Show less' : 'Read more'}
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};
