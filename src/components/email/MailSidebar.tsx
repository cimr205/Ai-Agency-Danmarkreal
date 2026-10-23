import { useState } from 'react';
import { Inbox, Star, Send, FileText, Trash2, Plus, X, Mail, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { EmailFolder } from '@/hooks/useEmailFolders';

export type FolderId = 'inbox' | 'important' | 'starred' | 'sent' | 'drafts' | 'trash' | `custom:${string}`;

interface MailSidebarProps {
  activeFolder: FolderId;
  onSelectFolder: (id: FolderId) => void;
  counts: { inbox: number; unreadInbox: number; important: number; starred: number; sent: number };
  customFolders: EmailFolder[];
  onAddFolder: (name: string, keyword: string) => void;
  onRemoveFolder: (id: string) => void;
}

export function MailSidebar({ activeFolder, onSelectFolder, counts, customFolders, onAddFolder, onRemoveFolder }: MailSidebarProps) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderKeyword, setFolderKeyword] = useState('');

  const items: { id: FolderId; label: string; icon: typeof Inbox; count?: number }[] = [
    { id: 'inbox', label: t('pages.email.inbox'), icon: Inbox, count: counts.unreadInbox },
    { id: 'important', label: t('pages.email.important'), icon: Shield, count: counts.important || undefined },
    { id: 'sent', label: t('pages.email.sent'), icon: Send },
  ];

  const handleCreate = () => {
    if (!folderName.trim() || !folderKeyword.trim()) return;
    onAddFolder(folderName, folderKeyword);
    setFolderName('');
    setFolderKeyword('');
    setAddOpen(false);
  };

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-y-auto p-3">
      <div className="flex items-center gap-2 px-2 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-foreground">{t('pages.email.smartInbox')}</span>
      </div>

      {items.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          onClick={() => onSelectFolder(id)}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left',
            activeFolder === id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          {!!count && <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-medium', activeFolder === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{count}</span>}
        </button>
      ))}

      <button
        onClick={() => onSelectFolder('starred')}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left',
          activeFolder === 'starred' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <Star className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{t('pages.email.starred')}</span>
        {!!counts.starred && <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-medium', activeFolder === 'starred' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{counts.starred}</span>}
      </button>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground/50">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{t('pages.email.drafts')}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right"><p className="max-w-xs text-xs">{t('pages.email.draftsNotSupported')}</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground/50">
              <Trash2 className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{t('pages.email.deleted')}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right"><p className="max-w-xs text-xs">{t('pages.email.deleteNotSupported')}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="mt-4 flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('pages.email.folders')}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddOpen(true)} aria-label={t('pages.email.addFolder')}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {customFolders.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t('pages.email.noFoldersYet')}</p>
      ) : (
        customFolders.map((folder) => (
          <div
            key={folder.id}
            className={cn(
              'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              activeFolder === `custom:${folder.id}` ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <button onClick={() => onSelectFolder(`custom:${folder.id}`)} className="flex flex-1 items-center gap-2.5 truncate text-left">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span className="truncate">{folder.name}</span>
            </button>
            <button
              onClick={() => onRemoveFolder(folder.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              aria-label={t('pages.email.deleteFolder')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}

      <button onClick={() => setAddOpen(true)} className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground text-left">
        <Plus className="h-4 w-4 shrink-0" />
        <span>{t('pages.email.addFolder')}</span>
      </button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pages.email.addFolder')}</DialogTitle>
            <DialogDescription>{t('pages.email.addFolderDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{t('pages.email.folderName')}</label>
              <Input value={folderName} onChange={e => setFolderName(e.target.value)} placeholder={t('pages.email.folderNamePlaceholder')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('pages.email.folderKeyword')}</label>
              <Input value={folderKeyword} onChange={e => setFolderKeyword(e.target.value)} placeholder={t('pages.email.folderKeywordPlaceholder')} className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">{t('pages.email.folderKeywordHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('pages.email.cancel')}</Button>
            <Button onClick={handleCreate} disabled={!folderName.trim() || !folderKeyword.trim()}>{t('pages.email.createFolder')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
