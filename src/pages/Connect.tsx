import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Key, Lock, Wifi, Trash2, Monitor, Upload } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSSHStore } from '@/store/ssh';
import type { AuthType, ConnectionMode, ConnectionConfig } from '@/types';

export default function Connect() {
  const navigate = useNavigate();
  const { connect: wsConnect, send, isConnected, lastMessage, disconnect } = useWebSocket();
  const { addConnection, addSession, connectionHistory, addHistory, removeHistory, loadHistory } = useSSHStore();

  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<AuthType>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [mode, setMode] = useState<ConnectionMode>('https-ssh');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    wsConnect();
    return () => { disconnect(); };
  }, [wsConnect, disconnect]);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'ssh-connected') {
      setConnecting(false);
      const sid = lastMessage.sessionId;
      if (sid) navigate(`/terminal/${sid}`);
    }
    if (lastMessage.type === 'ssh-error') {
      setConnecting(false);
      setError(lastMessage.message || lastMessage.error || '连接失败');
    }
  }, [lastMessage, navigate]);

  const handleConnect = useCallback(() => {
    setError('');
    if (!host.trim() || !username.trim()) {
      setError('请填写主机和用户名');
      return;
    }
    if (authType === 'password' && !password) {
      setError('请输入密码');
      return;
    }
    if (authType === 'key' && !privateKey) {
      setError('请提供密钥');
      return;
    }
    setConnecting(true);
    const sessionId = crypto.randomUUID();
    const config: ConnectionConfig = {
      sessionId,
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      authType,
      password: authType === 'password' ? password : undefined,
      privateKey: authType === 'key' ? privateKey : undefined,
      passphrase: authType === 'key' && passphrase ? passphrase : undefined,
      mode,
    };
    addConnection(config);
    addSession({ id: sessionId, label: `${username}@${host}`, config });
    addHistory(config);
    send({
      type: 'ssh-connect',
      sessionId,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      password: config.password,
      privateKey: config.privateKey,
      passphrase: config.passphrase,
      mode: config.mode,
    });
  }, [host, port, username, authType, password, privateKey, passphrase, mode, addConnection, addSession, addHistory, send]);

  const handleHistoryConnect = useCallback((h: typeof connectionHistory[0]) => {
    setError('');
    setConnecting(true);
    const sessionId = crypto.randomUUID();
    const config: ConnectionConfig = {
      sessionId,
      host: h.host,
      port: h.port,
      username: h.username,
      authType: h.authType,
      mode: h.mode,
    };
    addConnection(config);
    addSession({ id: sessionId, label: `${h.username}@${h.host}`, config });
    addHistory(config);
    send({
      type: 'ssh-connect',
      sessionId,
      host: h.host,
      port: h.port,
      username: h.username,
      authType: h.authType,
      mode: h.mode,
    });
  }, [addConnection, addSession, addHistory, send]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPrivateKey(ev.target?.result as string || '');
      reader.readAsText(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPrivateKey(ev.target?.result as string || '');
      reader.readAsText(file);
    }
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyber-blue/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Connection Form */}
        <div className="lg:col-span-3">
          <div className="bg-cyber-card/80 border border-neon/10 rounded-2xl p-8 backdrop-blur-xl shadow-[0_0_40px_rgba(0,255,136,0.05)]">
            {/* Title */}
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-neon tracking-wider" style={{ textShadow: '0 0 20px rgba(0,255,136,0.5), 0 0 40px rgba(0,255,136,0.2)' }}>
                WebSSH
              </h1>
              <p className="text-slate-400 mt-2 text-sm">安全连接远程服务器</p>
            </div>

            {/* Connection Mode Toggle */}
            <div className="mb-6">
              <label className="text-xs text-slate-500 uppercase tracking-wider mb-2 block">连接模式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('https-ssh')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    mode === 'https-ssh'
                      ? 'bg-neon/15 text-neon border border-neon/30 shadow-[0_0_15px_rgba(0,255,136,0.15)]'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  HTTPS转SSH
                </button>
                <button
                  onClick={() => setMode('direct')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    mode === 'direct'
                      ? 'bg-neon/15 text-neon border border-neon/30 shadow-[0_0_15px_rgba(0,255,136,0.15)]'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <Wifi className="w-4 h-4" />
                  SSH直连
                </button>
              </div>
            </div>

            {/* Host & Port */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="col-span-3">
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">主机地址</label>
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.1 或 example.com"
                    className="w-full bg-slate-900/60 border border-neon/20 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon/50 focus:shadow-[0_0_15px_rgba(0,255,136,0.1)] transition-all duration-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">端口</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full bg-slate-900/60 border border-neon/20 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-neon/50 focus:shadow-[0_0_15px_rgba(0,255,136,0.1)] transition-all duration-200"
                />
              </div>
            </div>

            {/* Username */}
            <div className="mb-6">
              <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">用户名</label>
              <div className="relative">
                <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root"
                  className="w-full bg-slate-900/60 border border-neon/20 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon/50 focus:shadow-[0_0_15px_rgba(0,255,136,0.1)] transition-all duration-200"
                />
              </div>
            </div>

            {/* Auth Type Toggle */}
            <div className="mb-5">
              <label className="text-xs text-slate-500 uppercase tracking-wider mb-2 block">认证方式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthType('password')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    authType === 'password'
                      ? 'bg-neon/15 text-neon border border-neon/30 shadow-[0_0_15px_rgba(0,255,136,0.15)]'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  密码认证
                </button>
                <button
                  onClick={() => setAuthType('key')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    authType === 'key'
                      ? 'bg-neon/15 text-neon border border-neon/30 shadow-[0_0_15px_rgba(0,255,136,0.15)]'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  <Key className="w-4 h-4" />
                  密钥认证
                </button>
              </div>
            </div>

            {/* Auth Fields */}
            {authType === 'password' ? (
              <div className="mb-6">
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    className="w-full bg-slate-900/60 border border-neon/20 rounded-lg pl-10 pr-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon/50 focus:shadow-[0_0_15px_rgba(0,255,136,0.1)] transition-all duration-200"
                  />
                </div>
              </div>
            ) : (
              <div className="mb-6 space-y-4">
                {/* Drag and drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => keyInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 ${
                    dragOver
                      ? 'border-neon/50 bg-neon/5'
                      : 'border-slate-700/50 bg-slate-900/30 hover:border-neon/30'
                  }`}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                  <p className="text-sm text-slate-400">拖拽密钥文件到此处，或点击选择</p>
                  <input
                    ref={keyInputRef}
                    type="file"
                    accept=".pem,.key,.pub,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                {/* Textarea for key */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">或粘贴密钥内容</label>
                  <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    rows={4}
                    className="w-full bg-slate-900/60 border border-neon/20 rounded-lg px-4 py-2.5 text-slate-200 placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-neon/50 focus:shadow-[0_0_15px_rgba(0,255,136,0.1)] transition-all duration-200 resize-none"
                  />
                </div>
                {/* Passphrase */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">密钥口令 (可选)</label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="密钥口令"
                    className="w-full bg-slate-900/60 border border-neon/20 rounded-lg px-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon/50 focus:shadow-[0_0_15px_rgba(0,255,136,0.1)] transition-all duration-200"
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Connect Button */}
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full py-3 rounded-lg font-semibold text-cyber-bg bg-neon hover:bg-neon/90 transition-all duration-200 shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-cyber-bg/30 border-t-cyber-bg rounded-full animate-spin" />
                  连接中...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Wifi className="w-4 h-4" />
                  连接
                </span>
              )}
            </button>

            {/* Connection status */}
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon shadow-[0_0_6px_rgba(0,255,136,0.5)]' : 'bg-slate-600'}`} />
              {isConnected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
            </div>
          </div>
        </div>

        {/* Right: Connection History */}
        <div className="lg:col-span-2">
          <div className="bg-cyber-card/80 border border-neon/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_0_40px_rgba(0,255,136,0.05)]">
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-neon" />
              连接历史
            </h2>

            {connectionHistory.length === 0 ? (
              <div className="text-center py-12">
                <Server className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                <p className="text-slate-500 text-sm">暂无连接记录</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar">
                {connectionHistory.map((h) => (
                  <div
                    key={h.id}
                    className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-4 hover:border-neon/20 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-slate-200 font-medium text-sm">{h.username}@{h.host}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          :{h.port} · {h.mode === 'https-ssh' ? 'HTTPS转SSH' : 'SSH直连'} · {h.authType === 'password' ? '密码' : '密钥'}
                        </p>
                      </div>
                      <span className="text-slate-600 text-xs">{formatTime(h.lastConnected)}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleHistoryConnect(h)}
                        className="flex-1 py-1.5 rounded-md text-xs font-medium bg-neon/10 text-neon border border-neon/20 hover:bg-neon/20 transition-all duration-200"
                      >
                        连接
                      </button>
                      <button
                        onClick={() => removeHistory(h.id)}
                        className="px-3 py-1.5 rounded-md text-xs text-slate-500 border border-slate-700/30 hover:border-red-500/30 hover:text-red-400 transition-all duration-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
