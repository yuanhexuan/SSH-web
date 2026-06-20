import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FolderOpen, File, Upload, Download, Trash2, Edit, Plus,
  RefreshCw, ArrowLeft, Save, X, ChevronRight, Folder, Search,
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSSHStore } from '@/store/ssh';
import type { FileEntry } from '@/types';

export default function FileManager() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { send, isConnected, lastMessage, connect: wsConnect, disconnect } = useWebSocket();
  const { currentPath, fileList, setCurrentPath, setFileList } = useSSHStore();

  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    wsConnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Request file list on mount and path change
  useEffect(() => {
    if (sessionId && isConnected) {
      setLoading(true);
      send({
        type: 'file-operation',
        sessionId,
        operation: 'list',
        path: currentPath,
      });
    }
  }, [sessionId, currentPath, isConnected, send]);

  // Handle file-result messages
  useEffect(() => {
    if (!lastMessage || lastMessage.sessionId !== sessionId) return;

    if (lastMessage.type === 'file-result') {
      setLoading(false);
      const op = lastMessage.operation;

      if (op === 'list' && Array.isArray(lastMessage.files)) {
        setFileList(lastMessage.files as FileEntry[]);
      }

      if (op === 'read') {
        setEditContent(lastMessage.content || '');
        setEditingFile(selectedFile);
      }

      if (op === 'write') {
        setEditingFile(null);
        setEditContent('');
        // Refresh file list
        send({
          type: 'file-operation',
          sessionId: sessionId!,
          operation: 'list',
          path: currentPath,
        });
      }

      if (op === 'delete' || op === 'rename' || op === 'mkdir') {
        send({
          type: 'file-operation',
          sessionId: sessionId!,
          operation: 'list',
          path: currentPath,
        });
      }
    }
  }, [lastMessage, sessionId, currentPath, selectedFile, send, setFileList]);

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSelectedFile(null);
  }, [setCurrentPath]);

  const handleDoubleClick = useCallback((file: FileEntry) => {
    if (file.isDirectory) {
      handleNavigate(file.path);
    } else {
      // Open text file for editing
      setSelectedFile(file);
      send({
        type: 'file-operation',
        sessionId: sessionId!,
        operation: 'read',
        path: file.path,
      });
    }
  }, [handleNavigate, send, sessionId]);

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      send({
        type: 'file-operation',
        sessionId,
        operation: 'upload',
        path: `${currentPath}/${file.name}`,
        content: btoa(content),
      });
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }, [currentPath, send, sessionId]);

  const handleNewFolder = useCallback(() => {
    const name = prompt('文件夹名称:');
    if (name && sessionId) {
      send({
        type: 'file-operation',
        sessionId,
        operation: 'mkdir',
        path: `${currentPath}/${name}`,
      });
    }
  }, [currentPath, send, sessionId]);

  const handleRefresh = useCallback(() => {
    if (sessionId) {
      setLoading(true);
      send({
        type: 'file-operation',
        sessionId,
        operation: 'list',
        path: currentPath,
      });
    }
  }, [currentPath, send, sessionId]);

  const handleSave = useCallback(() => {
    if (editingFile && sessionId) {
      send({
        type: 'file-operation',
        sessionId,
        operation: 'write',
        path: editingFile.path,
        content: btoa(unescape(encodeURIComponent(editContent))),
      });
    }
  }, [editingFile, editContent, send, sessionId]);

  const handleDownload = useCallback((file: FileEntry) => {
    if (!sessionId) return;
    send({
      type: 'file-operation',
      sessionId,
      operation: 'download',
      path: file.path,
    });
  }, [send, sessionId]);

  const handleDelete = useCallback((file: FileEntry) => {
    if (!sessionId) return;
    if (!confirm(`确定删除 ${file.name}?`)) return;
    send({
      type: 'file-operation',
      sessionId,
      operation: 'delete',
      path: file.path,
    });
    setContextMenu(null);
  }, [send, sessionId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    const newPath = '/' + parts.slice(0, index + 1).join('/');
    handleNavigate(newPath);
  }, [currentPath, handleNavigate]);

  const pathParts = currentPath.split('/').filter(Boolean);
  const filteredFiles = fileList.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (size: number) => {
    if (size === 0) return '-';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}K`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}M`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)}G`;
  };

  const formatDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatMode = (mode: number) => {
    return (mode & 0o777).toString(8).padStart(3, '0');
  };

  return (
    <div className="h-screen flex flex-col bg-cyber-bg" onClick={() => setContextMenu(null)}>
      {/* Top bar */}
      <div className="flex items-center gap-3 bg-cyber-card/80 border-b border-neon/10 px-4 py-2 shrink-0">
        <button
          onClick={() => navigate(`/terminal/${sessionId}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-neon hover:bg-neon/10 border border-slate-700/30 hover:border-neon/20 transition-all duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          终端
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => handleNavigate('/')}
            className="text-slate-400 hover:text-neon transition-colors text-sm shrink-0"
          >
            /
          </button>
          {pathParts.map((part, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <button
                onClick={() => handleBreadcrumbClick(i)}
                className="text-slate-400 hover:text-neon transition-colors text-sm"
              >
                {part}
              </button>
            </div>
          ))}
        </div>

        <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-neon shadow-[0_0_6px_rgba(0,255,136,0.5)]' : 'bg-slate-600'}`} />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 bg-cyber-card/50 border-b border-neon/5 px-4 py-2 shrink-0">
        <button
          onClick={handleUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-neon hover:bg-neon/10 border border-slate-700/30 hover:border-neon/20 transition-all duration-200"
        >
          <Upload className="w-3.5 h-3.5" />
          上传
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
        <button
          onClick={handleNewFolder}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-neon hover:bg-neon/10 border border-slate-700/30 hover:border-neon/20 transition-all duration-200"
        >
          <Plus className="w-3.5 h-3.5" />
          新建文件夹
        </button>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-neon hover:bg-neon/10 border border-slate-700/30 hover:border-neon/20 transition-all duration-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件..."
            className="bg-slate-900/60 border border-neon/20 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon/50 transition-all duration-200 w-48"
          />
        </div>
        <div className="flex gap-1 ml-2">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded text-xs ${viewMode === 'list' ? 'text-neon bg-neon/10' : 'text-slate-500 hover:text-slate-300'}`}
          >
            ≡
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded text-xs ${viewMode === 'grid' ? 'text-neon bg-neon/10' : 'text-slate-500 hover:text-slate-300'}`}
          >
            ⊞
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - directory tree */}
        <div className="w-48 bg-cyber-card/30 border-r border-neon/5 p-3 overflow-y-auto custom-scrollbar shrink-0">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2">目录</h3>
          <div className="space-y-0.5">
            <button
              onClick={() => handleNavigate('/')}
              className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs transition-colors ${
                currentPath === '/' ? 'text-neon bg-neon/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              /
            </button>
            {pathParts.map((part, i) => {
              const path = '/' + pathParts.slice(0, i + 1).join('/');
              return (
                <button
                  key={path}
                  onClick={() => handleNavigate(path)}
                  className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs transition-colors ${
                    currentPath === path ? 'text-neon bg-neon/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  style={{ paddingLeft: `${(i + 1) * 12 + 8}px` }}
                >
                  <Folder className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{part}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-16">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 text-slate-700" />
              <p className="text-slate-500 text-sm">{loading ? '加载中...' : '空目录'}</p>
            </div>
          ) : viewMode === 'list' ? (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800/50">
                  <th className="text-left pb-2 pl-8">名称</th>
                  <th className="text-right pb-2 w-20">大小</th>
                  <th className="text-right pb-2 w-28">修改时间</th>
                  <th className="text-right pb-2 w-16">权限</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr
                    key={file.path}
                    className={`border-b border-slate-800/30 hover:bg-neon/5 cursor-pointer transition-colors ${
                      selectedFile?.path === file.path ? 'bg-neon/10' : ''
                    }`}
                    onClick={() => setSelectedFile(file)}
                    onDoubleClick={() => handleDoubleClick(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                  >
                    <td className="py-2 pl-2 flex items-center gap-2">
                      {file.isDirectory ? (
                        <Folder className="w-4 h-4 text-cyber-blue shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <span className={`text-sm truncate ${file.isDirectory ? 'text-slate-200' : 'text-slate-300'}`}>
                        {file.name}
                      </span>
                    </td>
                    <td className="text-right text-xs text-slate-500">{file.isDirectory ? '-' : formatSize(file.size)}</td>
                    <td className="text-right text-xs text-slate-500">{formatDate(file.mtime)}</td>
                    <td className="text-right text-xs text-slate-600 font-mono">{formatMode(file.mode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {filteredFiles.map((file) => (
                <div
                  key={file.path}
                  className={`bg-cyber-card/50 border rounded-lg p-3 cursor-pointer transition-all duration-200 hover:border-neon/20 ${
                    selectedFile?.path === file.path ? 'border-neon/30 bg-neon/5' : 'border-slate-700/30'
                  }`}
                  onClick={() => setSelectedFile(file)}
                  onDoubleClick={() => handleDoubleClick(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                >
                  <div className="flex flex-col items-center gap-2">
                    {file.isDirectory ? (
                      <Folder className="w-8 h-8 text-cyber-blue" />
                    ) : (
                      <File className="w-8 h-8 text-slate-500" />
                    )}
                    <span className="text-xs text-slate-300 text-center truncate w-full">{file.name}</span>
                    <span className="text-xs text-slate-600">{file.isDirectory ? '' : formatSize(file.size)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-cyber-card border border-neon/20 rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {!contextMenu.file.isDirectory && (
            <button
              onClick={() => { handleDownload(contextMenu.file); setContextMenu(null); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-neon/10 hover:text-neon transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载
            </button>
          )}
          <button
            onClick={() => { handleDelete(contextMenu.file); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
          <button
            onClick={() => {
              const newName = prompt('新名称:', contextMenu.file.name);
              if (newName && sessionId) {
                send({
                  type: 'file-operation',
                  sessionId,
                  operation: 'rename',
                  path: contextMenu.file.path,
                  newPath: `${currentPath}/${newName}`,
                });
              }
              setContextMenu(null);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-neon/10 hover:text-neon transition-colors"
          >
            <Edit className="w-3.5 h-3.5" />
            重命名
          </button>
        </div>
      )}

      {/* File editor modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-cyber-card border border-neon/20 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-[0_0_40px_rgba(0,255,136,0.1)]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-neon/10">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-neon" />
                <span className="text-sm text-slate-200 font-medium">{editingFile.name}</span>
              </div>
              <button
                onClick={() => { setEditingFile(null); setEditContent(''); }}
                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full bg-slate-900/60 border border-neon/10 rounded-lg p-4 text-slate-200 font-mono text-sm focus:outline-none focus:border-neon/30 resize-none custom-scrollbar"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-neon/10">
              <button
                onClick={() => { setEditingFile(null); setEditContent(''); }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-700/30 hover:border-slate-600 transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-cyber-bg bg-neon hover:bg-neon/90 transition-all duration-200 shadow-[0_0_15px_rgba(0,255,136,0.3)]"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
