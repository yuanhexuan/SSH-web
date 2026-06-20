import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as TerminalIcon, Plus, X, Copy, Maximize2, Minus, FolderOpen, Search } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSSHStore } from '@/store/ssh';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { send, isConnected, lastMessage, connect: wsConnect, disconnect } = useWebSocket();
  const { sessions, activeSessionId, setActiveSession, removeSession, addSession, addConnection, connections } = useSSHStore();

  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    wsConnect();
    return () => { disconnect(); };
  }, [wsConnect, disconnect]);

  // Initialize xterm.js
  useEffect(() => {
    if (!termRef.current) return;
    if (xtermRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: '#0a0e17',
        foreground: '#e2e8f0',
        cursor: '#00ff88',
        cursorAccent: '#0a0e17',
        selectionBackground: 'rgba(0,255,136,0.3)',
        selectionForeground: '#e2e8f0',
        black: '#0a0e17',
        red: '#ff5555',
        green: '#00ff88',
        yellow: '#f1fa8c',
        blue: '#0ea5e9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#e2e8f0',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#63b8ff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
      fontSize,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(termRef.current);
    fitAddon.fit();

    xterm.onData((data) => {
      if (sessionId) {
        send({ type: 'terminal-input', sessionId, data });
      }
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      try { fitAddon.fit(); } catch {}
    };
    window.addEventListener('resize', handleResize);

    // Initial resize notification
    setTimeout(() => {
      handleResize();
      if (sessionId) {
        send({
          type: 'terminal-resize',
          sessionId,
          cols: xterm.cols,
          rows: xterm.rows,
        });
      }
    }, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update font size
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      try { fitAddonRef.current?.fit(); } catch {}
    }
  }, [fontSize]);

  // Handle incoming terminal output
  useEffect(() => {
    if (!lastMessage || !xtermRef.current) return;
    if (lastMessage.type === 'terminal-output' && lastMessage.sessionId === sessionId) {
      xtermRef.current.write(lastMessage.data || '');
    }
    if (lastMessage.type === 'ssh-error' && lastMessage.sessionId === sessionId) {
      xtermRef.current.write(`\r\n\x1b[31m连接错误: ${lastMessage.message || lastMessage.error || '未知错误'}\x1b[0m\r\n`);
    }
    if (lastMessage.type === 'ssh-disconnect' && lastMessage.sessionId === sessionId) {
      xtermRef.current.write('\r\n\x1b[33m连接已断开\x1b[0m\r\n');
    }
  }, [lastMessage, sessionId]);

  // Send resize on terminal dimensions change
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm || !sessionId) return;
    const disposable = xterm.onResize(({ cols, rows }) => {
      send({ type: 'terminal-resize', sessionId, cols, rows });
    });
    return () => disposable.dispose();
  }, [sessionId, send]);

  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSize((prev) => Math.max(8, Math.min(32, prev + delta)));
  }, []);

  const handleCopy = useCallback(async () => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    const selection = (xterm as any).getSelection?.() || '';
    if (selection) {
      await navigator.clipboard.writeText(selection);
    }
  }, []);

  const handlePaste = useCallback(async () => {
    const xterm = xtermRef.current;
    if (!xterm || !sessionId) return;
    try {
      const text = await navigator.clipboard.readText();
      send({ type: 'terminal-input', sessionId, data: text });
    } catch {}
  }, [sessionId, send]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleAddTab = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleCloseTab = useCallback((id: string) => {
    removeSession(id);
    if (sessions.length <= 1) {
      navigate('/');
    } else if (id === sessionId) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) {
        navigate(`/terminal/${remaining[0].id}`);
      }
    }
  }, [navigate, removeSession, sessions, sessionId]);

  const activeConfig = sessionId ? connections.get(sessionId) : null;

  return (
    <div className="h-screen flex flex-col bg-cyber-bg">
      {/* Tab bar */}
      <div className="flex items-center bg-cyber-card/80 border-b border-neon/10 px-2 py-1 shrink-0">
        <div className="flex items-center gap-1 flex-1 overflow-x-auto custom-scrollbar">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => { setActiveSession(s.id); navigate(`/terminal/${s.id}`); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs cursor-pointer transition-all duration-200 shrink-0 ${
                s.id === sessionId
                  ? 'bg-neon/10 text-neon border border-neon/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <TerminalIcon className="w-3 h-3" />
              <span>{s.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(s.id); }}
                className="ml-1 p-0.5 rounded hover:bg-slate-700/50 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={handleAddTab}
            className="p-1.5 rounded-md text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon shadow-[0_0_6px_rgba(0,255,136,0.5)]' : 'bg-slate-600'}`} />
          <span className="text-xs text-slate-500">{activeConfig ? `${activeConfig.username}@${activeConfig.host}` : ''}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 bg-cyber-card/50 border-b border-neon/5 px-3 py-1 shrink-0">
        <button
          onClick={() => handleFontSizeChange(-1)}
          className="p-1.5 rounded text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200"
          title="缩小字体"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-500 w-8 text-center">{fontSize}</span>
        <button
          onClick={() => handleFontSizeChange(1)}
          className="p-1.5 rounded text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200"
          title="放大字体"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-700/50 mx-1" />
        <button
          onClick={handleCopy}
          className="p-1.5 rounded text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200"
          title="复制"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handlePaste}
          className="p-1.5 rounded text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200"
          title="粘贴"
        >
          <span className="text-xs">📋</span>
        </button>
        <button
          onClick={handleFullscreen}
          className="p-1.5 rounded text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200"
          title="全屏"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-slate-700/50 mx-1" />
        <button
          onClick={() => sessionId && navigate(`/files/${sessionId}`)}
          className="p-1.5 rounded text-slate-500 hover:text-neon hover:bg-neon/10 transition-all duration-200 flex items-center gap-1"
          title="文件管理"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="text-xs">文件</span>
        </button>
      </div>

      {/* Terminal area */}
      <div className="flex-1 overflow-hidden p-1">
        <div ref={termRef} className="h-full w-full" />
      </div>
    </div>
  );
}
