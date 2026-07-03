import { ArrowLeftIcon, FileHtmlIcon, CopyIcon, ExternalLinkIcon, LinkIcon } from './Icons';
import { Button, useToast } from './ui';
import { encodePath } from '../nav';

interface FileViewerProps {
  fileName: string;
  path: string;
  onBack: () => void;
}

export function FileViewer({ fileName, path, onBack }: FileViewerProps) {
  const toast = useToast();
  const publicPath = encodePath(`/v${path === '/' ? '' : path}/${fileName}`);
  const publicUrl = window.location.origin + publicPath;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl).catch(() => {});
    toast('Link copied to clipboard');
  };

  const handleOpenTab = () => {
    window.open(publicPath, '_blank');
  };

  return (
    <div className="viewer">
      <div className="viewer__toolbar">
        <button className="viewer__back" onClick={onBack}>
          <ArrowLeftIcon width={16} height={16} />
          <span>Back</span>
        </button>
        <div className="viewer__filename">
          <FileHtmlIcon width={16} height={16} />
          <span>{fileName}</span>
        </div>
        <div className="viewer__actions">
          <Button size="small" icon={<CopyIcon width={15} height={15} />} onClick={handleCopyLink}>
            Copy link
          </Button>
          <Button size="small" icon={<ExternalLinkIcon width={15} height={15} />} onClick={handleOpenTab}>
            Open
          </Button>
        </div>
      </div>
      <div className="viewer__frame">
        <iframe
          src={publicPath}
          sandbox="allow-scripts"
          title={fileName}
        />
      </div>
      <div className="viewer__url-bar">
        <LinkIcon width={14} height={14} />
        <span className="viewer__url">{publicUrl}</span>
      </div>
    </div>
  );
}
