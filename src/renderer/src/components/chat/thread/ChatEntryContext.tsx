import { createContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useAuiState } from '@assistant-ui/react';
import { nextEntryState } from './chatEntryTransition';
import type { BoatAnchor } from './ChatParticleBackdrop';

type EntryLayout = {
  phase: 'welcome' | 'transition' | 'chat';
  welcomeRef: RefObject<HTMLDivElement | null>;
  footerRef: RefObject<HTMLDivElement | null>;
  welcomeStyle?: CSSProperties;
};
export const ChatEntryContext = createContext<EntryLayout | null>(null);

export function useChatEntry(chatId: string) {
  const hasMessages = useAuiState(s => s.thread.messages.length > 0);
  const hasUser = useAuiState(s => s.thread.messages.some(m => m.role === 'user'));
  const loading = useAuiState(s => s.thread.isLoading);
  const host = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [color, setColor] = useState('');
  const [bounds, setBounds] = useState({width:0,height:0});
  const [anchor, setAnchor] = useState<BoatAnchor | null>(null);
  const welcomeBox = useRef<BoatAnchor | null>(null);
  const input = {chatId,hasMessages,hasUser,loading,reduced};
  const [state, setState] = useState(() => nextEntryState(null,input));
  const next = nextEntryState(state,input);
  if (next.phase !== state.phase || next.armed !== state.armed || next.chatId !== state.chatId) setState(next);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    const theme = () => setColor(getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim());
    const observer = new MutationObserver(theme);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
    media.addEventListener('change',motion);
    document.addEventListener('visibilitychange',visibility);
    theme();
    return () => { observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility); };
  },[]);

  useEffect(() => {
    if (next.phase !== 'transition' || !visible) return;
    const id = window.setTimeout(() => setState(previous => previous.chatId === chatId
      ? nextEntryState(previous,{...input,completed:true}) : previous), 900);
    return () => clearTimeout(id);
  },[next.phase,chatId,visible]);

  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      setBounds(previous => previous.width === box.width && previous.height === box.height ? previous : {width:box.width,height:box.height});
      if (next.phase !== 'welcome') return;
      const boat = root.querySelector('[data-boat-anchor]')?.getBoundingClientRect();
      const welcome = welcomeRef.current?.getBoundingClientRect();
      if (boat) {
        const value = {left:boat.left-box.left,top:boat.top-box.top,width:boat.width,height:boat.height};
        setAnchor(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
      }
      if (welcome) welcomeBox.current = {left:welcome.left-box.left,top:welcome.top-box.top,width:welcome.width,height:welcome.height};
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (welcomeRef.current) observer.observe(welcomeRef.current);
    if (footerRef.current) observer.observe(footerRef.current);
    root.addEventListener('scroll',measure,true);
    return () => {observer.disconnect();root.removeEventListener('scroll',measure,true);};
  },[chatId,next.phase]);

  const layout: EntryLayout = {phase:next.phase,welcomeRef,footerRef,
    welcomeStyle: next.phase === 'transition' && welcomeBox.current
      ? {position:'absolute',...welcomeBox.current,pointerEvents:'none',zIndex:1} : undefined};
  return {layout,host,anchor,...bounds,color,visible,reduced,phase:next.phase};
}
