// src/lib/utils.ts
import { Course } from '../types.ts';

export const getCourseImage = (course: Course): string => {
  const title = (course.title || '').toLowerCase();
  const desc = (course.description || '').toLowerCase();
  const text = `${title} ${desc}`;
  
  if (text.includes('web development') || text.includes('html') || text.includes('css') || text.includes('javascript') || text.includes('frontend')) {
    return 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('react') || text.includes('component') || text.includes('hook')) {
    return 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('design') || text.includes('ui/ux') || text.includes('interface') || text.includes('figma')) {
    return 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('agri') || text.includes('crop') || text.includes('soil') || text.includes('farm') || text.includes('field')) {
    return 'https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('math') || text.includes('quant') || text.includes('stat') || text.includes('model') || text.includes('estim')) {
    return 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
};

export const authHeaders = (token: string): Record<string, string> => ({
  'Authorization': `Bearer ${token}`
});

export const jsonHeaders = (token: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
});
