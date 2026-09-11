import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AspectRatioRoundedIcon from '@mui/icons-material/AspectRatioRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import Forward10RoundedIcon from '@mui/icons-material/Forward10Rounded';
import Forward30RoundedIcon from '@mui/icons-material/Forward30Rounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FormatSizeRoundedIcon from '@mui/icons-material/FormatSizeRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import MessageSharpIcon from '@mui/icons-material/MessageSharp';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import Replay10RoundedIcon from '@mui/icons-material/Replay10Rounded';
import Replay30RoundedIcon from '@mui/icons-material/Replay30Rounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import SubtitlesRoundedIcon from '@mui/icons-material/SubtitlesRounded';
import { formatTime, normalizeSeekStep } from '../utils/time.js';
import {
  DEFAULT_SUBTITLE_APPEARANCE,
  SUBTITLE_SIZE_PRESETS,
  SUBTITLE_STYLE_PRESETS,
} from '../utils/subtitlePreferences.js';
import { normalizeResizeMode } from '../utils/playerProps.js';

function optionKey(option) {
  return String(option?.value ?? option?.id ?? option?.index ?? '');
}

function optionLabel(option, fallback) {
  return option?.label || option?.title || option?.name || fallback;
}

function isSelected(value, option) {
  return String(value) === optionKey(option);
}

const TOOLTIP_LABELS = {
  en: {
    back: 'Back',
    reload: 'Restart',
    settings: 'Audio and subtitles',
    fullscreen: 'Fullscreen',
    pip: 'Picture in picture',
    pipExit: 'Exit picture in picture',
    resizeMode: 'Resize mode',
    resizeModeContain: 'Contain',
    resizeModeCover: 'Cover',
    resizeModeStretch: 'Stretch',
    resizeModeCenter: 'Center',
    resizeModeNone: 'Original',
    rewind: (seconds) => `Rewind ${seconds} seconds`,
    forward: (seconds) => `Forward ${seconds} seconds`,
    pause: 'Pause',
    play: 'Play',
    backToControls: 'Back to controls',
    nextEpisode: 'Next episode',
    subtitles: 'Subtitles',
    noSubtitles: 'No subtitles',
    subtitlesOff: 'Off',
    subtitlesFallback: 'Subtitles',
    audioLanguage: 'Audio language',
    audioFallback: 'Audio',
    subtitleAppearance: 'Subtitle appearance',
    track: 'Track',
    sizes: {
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
    },
    styles: {
      clear: 'Light',
      contrast: 'Contrast',
      dark: 'Dark',
      shadow: 'Drop shadow',
    },
  },
  es: {
    back: 'Regresar',
    reload: 'Reiniciar',
    settings: 'Audio y subtítulos',
    fullscreen: 'Pantalla completa',
    pip: 'Imagen en imagen',
    pipExit: 'Salir de imagen en imagen',
    resizeMode: 'Modo de imagen',
    resizeModeContain: 'Contener',
    resizeModeCover: 'Cubrir',
    resizeModeStretch: 'Estirar',
    resizeModeCenter: 'Centrar',
    resizeModeNone: 'Original',
    rewind: (seconds) => `-${seconds} segundos`,
    forward: (seconds) => `+${seconds} segundos`,
    pause: 'Pausar',
    play: 'Reproducir',
    backToControls: 'Regresar a controles',
    nextEpisode: 'Siguiente episodio',
    subtitles: 'Subtítulos',
    noSubtitles: 'Sin subtítulos',
    subtitlesOff: 'Desactivados',
    subtitlesFallback: 'Subtítulos',
    audioLanguage: 'Idioma de audio',
    audioFallback: 'Audio',
    subtitleAppearance: 'Aspecto de los subtítulos',
    track: 'Pista',
    sizes: {
      small: 'Pequeño',
      medium: 'Medio',
      large: 'Grande',
    },
    styles: {
      clear: 'Claro',
      contrast: 'Contraste',
      dark: 'Oscuro',
      shadow: 'Sombra paralela',
    },
  },
};

function getTooltipLabels(locale) {
  const normalized = String(locale || 'en').trim().toLowerCase();
  const language = normalized.split(/[-_]/)[0];
  return TOOLTIP_LABELS[language] || TOOLTIP_LABELS.en;
}

function settingsFocusKey(panel, value) {
  const normalized = String(value ?? '')
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/^_+|_+$/g, '');
  return `${panel}-${normalized || 'none'}`;
}

function getProgressArrowDirection(event) {
  const key = event?.key || event?.code;
  if (key === 'ArrowLeft' || key === 'Left' || event?.keyCode === 37) return -1;
  if (key === 'ArrowRight' || key === 'Right' || event?.keyCode === 39) return 1;
  return 0;
}

const PROGRESS_KEY_SEEK_DEBOUNCE_MS = 800;

function alphaColor(color, alpha) {
  const value = String(color || '').trim();
  const shortHex = value.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('').map((item) => parseInt(`${item}${item}`, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const longHex = value.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    const r = parseInt(longHex[1].slice(0, 2), 16);
    const g = parseInt(longHex[1].slice(2, 4), 16);
    const b = parseInt(longHex[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return `rgba(229, 9, 20, ${alpha})`;
}

function composeEventHandlers(existing, next) {
  return (event) => {
    existing?.(event);
    next?.(event);
  };
}

function ControlTooltip({
  title,
  children,
  placement = 'top',
  showFocusedTooltip = false,
  onShowFocusedTooltip,
  onHideFocusedTooltip,
}) {
  const child = isValidElement(children) ? children : <span>{children}</span>;
  const handleShow = (event) => {
    if (showFocusedTooltip) onShowFocusedTooltip?.(title, event.currentTarget);
  };
  const handleHide = () => {
    if (showFocusedTooltip) onHideFocusedTooltip?.(title);
  };
  const enhancedChild = cloneElement(child, {
    'data-control-tooltip-anchor': 'true',
    'data-control-tooltip-title': title,
    onFocus: composeEventHandlers(child.props.onFocus, handleShow),
    onBlur: composeEventHandlers(child.props.onBlur, handleHide),
    onMouseEnter: composeEventHandlers(child.props.onMouseEnter, handleShow),
    onMouseLeave: composeEventHandlers(child.props.onMouseLeave, handleHide),
  });

  return (
    <Tooltip
      title={title}
      placement={placement}
      arrow
      enterDelay={0}
      leaveDelay={0}
      disableInteractive
      disableFocusListener={showFocusedTooltip}
      disableHoverListener={showFocusedTooltip}
      disableTouchListener={showFocusedTooltip}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'rgba(17,19,25,.94)',
            border: '1px solid rgba(255,255,255,.32)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 0,
          },
        },
        arrow: {
          sx: { color: 'rgba(17,19,25,.94)' },
        },
      }}
    >
      {enhancedChild}
    </Tooltip>
  );
}

function SettingsSummaryCard({ title, value, icon, active, onClick, primaryColor, focusRingSx }) {
  return (
    <Button
      data-tv-focusable="true"
      data-settings-summary="true"
      onClick={onClick}
      sx={{
        display: 'block',
        width: '100%',
        minWidth: 0,
        p: { xs: 1.1, md: 1.5 },
        border: `2px solid ${active ? primaryColor : 'rgba(255,255,255,.45)'}`,
        borderRadius: 1.5,
        color: '#fff',
        bgcolor: 'rgba(17,19,25,.78)',
        textAlign: 'left',
        textTransform: 'none',
        ...focusRingSx,
        '&:hover': {
          bgcolor: 'rgba(17,19,25,.92)',
          borderColor: primaryColor,
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
        {icon}
        <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: { xs: 14, md: 18 }, fontWeight: 800 }}>
          {title}
        </Typography>
        <KeyboardArrowRightRoundedIcon sx={{ ml: 'auto', flex: '0 0 auto', opacity: 0.75 }} />
      </Stack>
      <Typography sx={{ mt: 0.75, px: 1, py: { xs: 0.8, md: 1 }, borderRadius: 0.75, bgcolor: active ? alphaColor(primaryColor, 0.36) : 'rgba(148,160,210,.72)', color: '#fff', fontSize: { xs: 15, md: 20 }, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Button>
  );
}

function SettingsOptionList({ panel, options, selected, onSelect, primaryColor, labels = TOOLTIP_LABELS.en }) {
  return (
    <Stack spacing={0.35} sx={{ maxHeight: { xs: '42vh', md: '45vh' }, overflowY: 'auto', pr: 0.5 }}>
      {options.map((option, index) => {
        const value = optionKey(option);
        const checked = isSelected(selected, option);
        const focusKey = settingsFocusKey(panel, option.value ?? option.id ?? option.index ?? value);
        return (
          <Button
            key={`${value || 'empty'}-${index}`}
            disabled={option.disabled}
            data-tv-focusable="true"
            data-settings-list-option="true"
            data-settings-option-selected={checked ? 'true' : 'false'}
            data-settings-option-focus-key={focusKey}
            onClick={() => onSelect?.(option.value ?? option.id ?? option.index ?? value, focusKey)}
            sx={{
              justifyContent: 'flex-start',
              minHeight: { xs: 42, md: 48 },
              px: 1.1,
              color: checked ? '#10131a' : 'rgba(255,255,255,.88)',
              bgcolor: checked ? '#f4f6ff' : 'transparent',
              fontSize: { xs: 16, md: 19 },
              fontWeight: checked ? 800 : 600,
              textTransform: 'none',
              position: 'relative',
              borderRadius: 0.75,
              overflow: 'hidden',
              clipPath: 'inset(0 round 6px)',
              backgroundClip: 'padding-box',
              textAlign: 'left',
              '&&:focus-visible, &&.Mui-focusVisible, &&[data-tv-focused="true"], &&.tv-remote-focused': {
                bgcolor: primaryColor,
                color: '#fff',
                borderRadius: 0.75,
                outline: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.38)',
              },
              '&:hover': {
                bgcolor: primaryColor,
                color: '#fff',
                borderRadius: 0.75,
              },
            }}
          >
            <Box sx={{ width: 25, flex: '0 0 25px', display: 'flex', alignItems: 'center' }}>
              {checked && <CheckRoundedIcon sx={{ fontSize: 20 }} />}
            </Box>
            <Typography sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'inherit', fontWeight: 'inherit' }}>
              {optionLabel(option, `${labels.track} ${index + 1}`)}
            </Typography>
          </Button>
        );
      })}
    </Stack>
  );
}

function SettingsAppearanceList({ appearance = DEFAULT_SUBTITLE_APPEARANCE, onSelect, primaryColor, labels = TOOLTIP_LABELS.en }) {
  return (
    <Stack spacing={0.35} sx={{ maxHeight: { xs: '48vh', md: '52vh' }, overflowY: 'auto', pr: 0.5 }}>
      {SUBTITLE_SIZE_PRESETS.map((preset) => {
        const checked = appearance.size === preset.value;
        const focusKey = settingsFocusKey('appearance-size', preset.value);
        return (
          <Button
            key={preset.value}
            data-tv-focusable="true"
            data-settings-list-option="true"
            data-settings-option-selected={checked ? 'true' : 'false'}
            data-settings-option-focus-key={focusKey}
            onClick={() => onSelect?.({ size: preset.value }, focusKey)}
            sx={{
              justifyContent: 'space-between',
              minHeight: { xs: 42, md: 48 },
              px: 1.1,
              color: checked ? '#10131a' : 'rgba(255,255,255,.88)',
              bgcolor: checked ? '#f4f6ff' : 'transparent',
              fontSize: { xs: 16, md: 19 },
              fontWeight: checked ? 800 : 600,
              textTransform: 'none',
              position: 'relative',
              borderRadius: 0.75,
              overflow: 'hidden',
              clipPath: 'inset(0 round 6px)',
              backgroundClip: 'padding-box',
              textAlign: 'left',
              '&&:focus-visible, &&.Mui-focusVisible, &&[data-tv-focused="true"], &&.tv-remote-focused': {
                bgcolor: primaryColor,
                color: '#fff',
                borderRadius: 0.75,
                outline: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.38)',
              },
              '&:hover': {
                bgcolor: primaryColor,
                color: '#fff',
                borderRadius: 0.75,
              },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {checked ? <CheckRoundedIcon sx={{ fontSize: 20 }} /> : <Box sx={{ width: 20 }} />}
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
                {labels.sizes[preset.value] || preset.label}
              </Typography>
            </Stack>
            <Typography sx={{ minWidth: 26, px: 0.35, color: '#111', bgcolor: '#fff', borderRadius: 0.25, fontSize: preset.sampleSize, lineHeight: 1.1, fontWeight: 900, textAlign: 'center' }}>
              Aa
            </Typography>
          </Button>
        );
      })}

      <Box sx={{ borderTop: '1px solid rgba(255,255,255,.48)', my: 0.9 }} />

      {SUBTITLE_STYLE_PRESETS.map((preset) => {
        const checked = appearance.style === preset.value;
        const focusKey = settingsFocusKey('appearance-style', preset.value);
        return (
          <Button
            key={preset.value}
            data-tv-focusable="true"
            data-settings-list-option="true"
            data-settings-option-selected={checked ? 'true' : 'false'}
            data-settings-option-focus-key={focusKey}
            onClick={() => onSelect?.({ style: preset.value }, focusKey)}
            sx={{
              justifyContent: 'space-between',
              minHeight: { xs: 42, md: 48 },
              px: 1.1,
              color: checked ? '#10131a' : 'rgba(255,255,255,.88)',
              bgcolor: checked ? '#f4f6ff' : 'transparent',
              fontSize: { xs: 16, md: 19 },
              fontWeight: checked ? 800 : 600,
              textTransform: 'none',
              position: 'relative',
              borderRadius: 0.75,
              overflow: 'hidden',
              clipPath: 'inset(0 round 6px)',
              backgroundClip: 'padding-box',
              textAlign: 'left',
              '&&:focus-visible, &&.Mui-focusVisible, &&[data-tv-focused="true"], &&.tv-remote-focused': {
                bgcolor: primaryColor,
                color: '#fff',
                borderRadius: 0.75,
                outline: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.38)',
              },
              '&:hover': {
                bgcolor: primaryColor,
                color: '#fff',
                borderRadius: 0.75,
              },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {checked ? <CheckRoundedIcon sx={{ fontSize: 20 }} /> : <Box sx={{ width: 20 }} />}
              <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
                {labels.styles[preset.value] || preset.label}
              </Typography>
            </Stack>
            <Typography sx={{ minWidth: 26, px: 0.35, color: preset.sampleColor, bgcolor: preset.sampleBackground, borderRadius: 0.25, fontSize: 15, lineHeight: 1.35, fontWeight: 900, textAlign: 'center' }}>
              Aa
            </Typography>
          </Button>
        );
      })}
    </Stack>
  );
}

export default function PlayerControls({
  overlay,
  live = false,
  primaryColor = '#e50914',
  locale = 'en',
  playing,
  playable = true,
  currentTime = 0,
  duration = 0,
  rewindStep = 10,
  forwardStep = 10,
  audioOptions = [],
  selectedAudio,
  subtitleOptions = [],
  selectedSubtitle,
  subtitleAppearance = DEFAULT_SUBTITLE_APPEARANCE,
  playerLayout,
  resizeMode = 'contain',
  onBack,
  onReload,
  onToggle,
  onJumpBackward,
  onJumpForward,
  onSeek,
  onProgressSeek,
  progressSeekStep = 0,
  onSelectAudio,
  onSelectSubtitle,
  onToggleResizeMode,
  onFullscreen,
  onPictureInPicture,
  pictureInPictureActive = false,
  onVisibilityChange,
  onSettingsStateChange,
  settingsBackSignal = 0,
  showBackButton = true,
  showSettingsBackButton = true,
  showFullscreenButton = true,
  showPictureInPictureButton = true,
  showResizeModeButton = true,
  showFocusedTooltips = false,
  onSubtitleAppearanceChange,
  hideSignal = 0,
  autoHideDelay = 5000,
}) {
  const [scrubValue, setScrubValue] = useState(null);
  const [trackPanelOpen, setTrackPanelOpen] = useState(false);
  const [activeSettingsPanel, setActiveSettingsPanel] = useState(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [focusedControlTooltip, setFocusedControlTooltip] = useState(null);
  const [progressFocused, setProgressFocused] = useState(false);
  const hideTimerRef = useRef(null);
  const keyboardSeekTimerRef = useRef(null);
  const keyboardSeekValueRef = useRef(null);
  const onProgressSeekRef = useRef(onProgressSeek);
  const playToggleRef = useRef(null);
  const autoContinueButtonRef = useRef(null);
  const segmentActionButtonRef = useRef(null);
  const controlsRootRef = useRef(null);
  const settingsOverlayRef = useRef(null);
  const trackPanelOpenRef = useRef(false);
  const lastHideSignalRef = useRef(hideSignal);
  const lastSettingsBackSignalRef = useRef(settingsBackSignal);
  const panelClosedByAutoHideRef = useRef(false);
  const [preferredSettingsFocusKey, setPreferredSettingsFocusKey] = useState('');
  const displayedTime = scrubValue ?? currentTime;
  const maxDuration = Math.max(duration, 0.001);
  const tooltipLabels = getTooltipLabels(locale);
  const playPauseTooltip = playing ? tooltipLabels.pause : tooltipLabels.play;
  const resolvedRewindStep = normalizeSeekStep(rewindStep);
  const resolvedForwardStep = normalizeSeekStep(forwardStep);
  const RewindIcon = resolvedRewindStep === 30 ? Replay30RoundedIcon : Replay10RoundedIcon;
  const ForwardIcon = resolvedForwardStep === 30 ? Forward30RoundedIcon : Forward10RoundedIcon;
  const rewindTooltip = tooltipLabels.rewind(resolvedRewindStep);
  const forwardTooltip = tooltipLabels.forward(resolvedForwardStep);
  const pictureInPictureTooltip = pictureInPictureActive ? tooltipLabels.pipExit : tooltipLabels.pip;
  const normalizedResizeMode = normalizeResizeMode(resizeMode);
  const resizeModeLabels = {
    contain: tooltipLabels.resizeModeContain,
    cover: tooltipLabels.resizeModeCover,
    stretch: tooltipLabels.resizeModeStretch,
    center: tooltipLabels.resizeModeCenter,
    none: tooltipLabels.resizeModeNone,
  };
  const resizeModeTooltip = `${tooltipLabels.resizeMode}: ${resizeModeLabels[normalizedResizeMode] || normalizedResizeMode}`;
  const layoutDensity = ['mini', 'compact', 'regular'].includes(playerLayout?.density)
    ? playerLayout.density
    : 'regular';
  const isMiniLayout = layoutDensity === 'mini';
  const isCompactLayout = layoutDensity === 'compact';
  const isConstrainedLayout = layoutDensity !== 'regular';

  const info = overlay || {};
  const title = info.title || info.name || info.epgTitle || '';
  const subtitle = info.subtitle || info.episode || info.description || '';
  const channelName = info.channelName || info.channel || info.channelLive || info.liveChannel || '';
  const channelLogo = info.channelLogo || info.logo || '';
  const epgTitle = info.epgTitle || '';
  const epgTime = info.epgTime || '';
  const isLive = Boolean(live || info.live || info.isLive);
  const showLiveBadge = Boolean(info.showLiveBadge);
  const liveChannelLabel = channelName;
  const liveMetaLabel = epgTime;
  const liveTitleLabel = epgTitle || title || subtitle;
  const autoContinue = info.autoContinue;
  const segmentAction = info.segmentAction || info.skipSegment;
  const shouldShowAutoContinue = Boolean(autoContinue?.visible && autoContinue?.onPress);
  const shouldShowSegmentAction = Boolean(segmentAction?.visible && segmentAction?.onPress);
  const shouldShowOverlayAction = shouldShowAutoContinue || shouldShowSegmentAction;
  const autoContinueProgressPercent = Math.max(0, Math.min(1, Number(autoContinue?.progress) || 0)) * 100;
  const autoContinueButtonBackground = `linear-gradient(90deg, ${primaryColor} 0%, ${primaryColor} ${autoContinueProgressPercent}%, #050505 ${autoContinueProgressPercent}%, #050505 100%)`;
  const hasSegmentProgress = segmentAction?.progress !== undefined && segmentAction?.progress !== null;
  const segmentActionProgressPercent = Math.max(0, Math.min(1, Number(segmentAction?.progress) || 0)) * 100;
  const segmentActionButtonBackground = hasSegmentProgress
    ? `linear-gradient(90deg, ${primaryColor} 0%, ${primaryColor} ${segmentActionProgressPercent}%, #050505 ${segmentActionProgressPercent}%, #050505 100%)`
    : '#050505';

  const hasMultipleAudioTracks = audioOptions.length > 1;
  const hasSubtitleTracks = subtitleOptions.length > 0;
  const hasAudioSettings = hasMultipleAudioTracks || (hasSubtitleTracks && audioOptions.length > 0);
  const hasTrackSettings = hasMultipleAudioTracks || hasSubtitleTracks;
  const showRestartControl = Boolean(onReload && !isLive && !isMiniLayout);
  const showSettingsControl = Boolean(hasTrackSettings && !isMiniLayout);
  const showResizeModeControl = Boolean(showResizeModeButton && onToggleResizeMode && !isMiniLayout);
  const showPictureInPictureControl = Boolean(showPictureInPictureButton && onPictureInPicture);
  const showFullscreenControl = Boolean(showFullscreenButton && onFullscreen && !isMiniLayout);
  const showSeekControls = Boolean(!isMiniLayout && !isLive);
  const showTopMetadata = Boolean(!isLive && !isConstrainedLayout && (title || subtitle));
  const showInlineChannelMeta = Boolean(!isLive && !isConstrainedLayout && (channelName || epgTitle));
  const showLiveInfoPanel = Boolean(isLive && !isMiniLayout && (liveChannelLabel || channelLogo || liveTitleLabel || liveMetaLabel));
  const showProgressSeekHint = Boolean(onProgressSeek && Number(progressSeekStep) > 0);
  const topInset = isMiniLayout ? 8 : isCompactLayout ? 14 : 24;
  const topOffset = isMiniLayout ? 8 : isCompactLayout ? 12 : 18;
  const controlSpacing = isMiniLayout ? 0.25 : isCompactLayout ? 0.6 : 1;
  const centerSpacing = isCompactLayout ? { xs: 1.5, md: 3 } : { xs: 3, md: 7 };
  const seekIconSize = isCompactLayout ? { xs: 38, md: 46 } : { xs: 46, md: 58 };
  const playIconSize = isMiniLayout ? { xs: 44, md: 52 } : isCompactLayout ? { xs: 50, md: 62 } : { xs: 58, md: 76 };
  const progressInset = isMiniLayout ? 12 : isCompactLayout ? 18 : 28;
  const progressBottom = isMiniLayout ? 10 : isCompactLayout ? 14 : 20;
  const settingsItemSx = {
    position: 'relative',
    minWidth: 0,
    width: { xs: '100%', md: 360 },
    maxWidth: { xs: '100%', md: 360 },
    flex: '0 0 auto',
  };
  const focusRingSx = {
    borderRadius: 1.5,
    overflow: 'hidden',
    clipPath: 'inset(0 round 12px)',
    '&:focus-visible, &.Mui-focusVisible, &[data-tv-focused="true"], &.tv-remote-focused': {
      outline: 'none',
      borderColor: primaryColor,
      bgcolor: alphaColor(primaryColor, 0.72),
      boxShadow: `inset 0 0 0 2px ${primaryColor}`,
    },
    '&:hover': {
      outline: 'none',
      borderColor: primaryColor,
      bgcolor: alphaColor(primaryColor, 0.72),
    },
  };
  const iconFocusRingSx = {
    '&:focus-visible, &.Mui-focusVisible, &[data-tv-focused="true"], &.tv-remote-focused': {
      outline: 'none',
      bgcolor: primaryColor,
      boxShadow: 'none',
    },
    '&:hover': {
      outline: 'none',
      bgcolor: 'rgba(255,255,255,.14)',
    },
  };
  const iconButtonSx = {
    color: '#fff',
    p: isMiniLayout ? 0.5 : isCompactLayout ? 0.75 : 1,
    ...iconFocusRingSx,
  };
  const subtitleList = useMemo(
    () => [{ value: '', label: tooltipLabels.noSubtitles }, ...subtitleOptions],
    [subtitleOptions, tooltipLabels.noSubtitles],
  );
  const selectedAudioOption = audioOptions.find((option) => isSelected(selectedAudio, option));
  const selectedAudioLabel = optionLabel(
    selectedAudioOption,
    audioOptions.length ? optionLabel(audioOptions[0], tooltipLabels.audioFallback) : tooltipLabels.audioFallback,
  );
  const selectedSubtitleValue = selectedSubtitle ?? '';
  const selectedSubtitleLabel = selectedSubtitleValue === ''
    ? tooltipLabels.subtitlesOff
    : optionLabel(
      subtitleOptions.find((option) => isSelected(selectedSubtitleValue, option)),
      tooltipLabels.subtitlesFallback,
    );
  const selectedSubtitleAppearance = subtitleAppearance || DEFAULT_SUBTITLE_APPEARANCE;
  const selectedSizeLabel = tooltipLabels.sizes[selectedSubtitleAppearance.size]
    || SUBTITLE_SIZE_PRESETS.find((preset) => preset.value === selectedSubtitleAppearance.size)?.label
    || tooltipLabels.sizes.medium;
  const selectedStyleLabel = tooltipLabels.styles[selectedSubtitleAppearance.style]
    || SUBTITLE_STYLE_PRESETS.find((preset) => preset.value === selectedSubtitleAppearance.style)?.label
    || tooltipLabels.styles.shadow;
  const appearanceLabel = `${selectedSizeLabel}, ${selectedStyleLabel}`;
  const visible = controlsVisible || trackPanelOpen || shouldShowOverlayAction;
  const normalVisible = controlsVisible && !trackPanelOpen && !shouldShowOverlayAction;
  const controlsVisibility = normalVisible || trackPanelOpen;

  onProgressSeekRef.current = onProgressSeek;

  const cancelKeyboardSeek = useCallback(() => {
    if (keyboardSeekTimerRef.current) {
      window.clearTimeout(keyboardSeekTimerRef.current);
      keyboardSeekTimerRef.current = null;
    }
    keyboardSeekValueRef.current = null;
  }, []);

  const commitKeyboardSeek = useCallback(() => {
    if (keyboardSeekTimerRef.current) {
      window.clearTimeout(keyboardSeekTimerRef.current);
      keyboardSeekTimerRef.current = null;
    }
    const target = keyboardSeekValueRef.current;
    keyboardSeekValueRef.current = null;
    if (target === null || target === undefined) return;
    setScrubValue(null);
    onProgressSeekRef.current?.(target);
  }, []);

  const queueKeyboardSeek = useCallback((direction) => {
    const step = Math.max(0, Number(progressSeekStep) || 0);
    if (!onProgressSeek || step <= 0 || !direction) return false;

    const base = keyboardSeekValueRef.current ?? scrubValue ?? currentTime;
    const next = Math.min(maxDuration, Math.max(0, Number(base) + direction * step));
    keyboardSeekValueRef.current = next;
    setScrubValue(next);
    if (keyboardSeekTimerRef.current) window.clearTimeout(keyboardSeekTimerRef.current);
    keyboardSeekTimerRef.current = window.setTimeout(commitKeyboardSeek, PROGRESS_KEY_SEEK_DEBOUNCE_MS);
    return true;
  }, [commitKeyboardSeek, currentTime, maxDuration, onProgressSeek, progressSeekStep, scrubValue]);

  useEffect(() => () => {
    if (keyboardSeekTimerRef.current) window.clearTimeout(keyboardSeekTimerRef.current);
  }, []);

  useEffect(() => {
    trackPanelOpenRef.current = trackPanelOpen;
  }, [trackPanelOpen]);

  const focusPlayToggle = useCallback(() => {
    const button = playToggleRef.current;
    if (!button || button.disabled) return;
    button.focus();
  }, []);

  const focusAutoContinue = useCallback(() => {
    const button = autoContinueButtonRef.current;
    if (!button || button.disabled) return;
    button.focus();
  }, []);

  const focusSegmentAction = useCallback(() => {
    const button = segmentActionButtonRef.current;
    if (!button || button.disabled) return;
    button.focus();
  }, []);

  const focusOverlayAction = useCallback(() => {
    if (shouldShowAutoContinue) {
      focusAutoContinue();
      return;
    }
    if (shouldShowSegmentAction) focusSegmentAction();
  }, [focusAutoContinue, focusSegmentAction, shouldShowAutoContinue, shouldShowSegmentAction]);

  const showControlTooltip = useCallback((label, anchor) => {
    if (!showFocusedTooltips || !label || !anchor || trackPanelOpenRef.current) return;
    const root = controlsRootRef.current;
    const rootRect = root?.getBoundingClientRect?.();
    const rect = anchor.getBoundingClientRect?.();
    if (!rootRect || !rect) return;

    const centerX = rect.left - rootRect.left + rect.width / 2;
    const showAbove = rect.top - rootRect.top > rootRect.height * 0.34;
    const y = showAbove
      ? rect.top - rootRect.top - 14
      : rect.bottom - rootRect.top + 14;

    setFocusedControlTooltip({
      label,
      x: Math.max(84, Math.min(rootRect.width - 84, centerX)),
      y: Math.max(18, Math.min(rootRect.height - 18, y)),
      showAbove,
    });
  }, [showFocusedTooltips]);

  const hideControlTooltip = useCallback((label) => {
    if (!showFocusedTooltips) return;
    setFocusedControlTooltip((current) => (
      !current || current.label === label ? null : current
    ));
  }, [showFocusedTooltips]);

  const clearHideTimer = useCallback(() => {
    if (!hideTimerRef.current) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      panelClosedByAutoHideRef.current = trackPanelOpenRef.current;
      setPreferredSettingsFocusKey('');
      setActiveSettingsPanel(null);
      setTrackPanelOpen(false);
      setControlsVisible(false);
      hideTimerRef.current = null;
    }, Math.max(1000, Number(autoHideDelay) || 5000));
  }, [autoHideDelay, clearHideTimer]);

  const revealControls = useCallback(() => {
    if (shouldShowOverlayAction) {
      clearHideTimer();
      panelClosedByAutoHideRef.current = false;
      setPreferredSettingsFocusKey('');
      setActiveSettingsPanel(null);
      setTrackPanelOpen(false);
      setControlsVisible(false);
      focusOverlayAction();
      return;
    }
    if (trackPanelOpenRef.current) {
      scheduleHide();
      return;
    }
    if (panelClosedByAutoHideRef.current) {
      panelClosedByAutoHideRef.current = false;
      setTrackPanelOpen(false);
    }
    setControlsVisible(true);
    scheduleHide();
  }, [clearHideTimer, focusOverlayAction, scheduleHide, shouldShowOverlayAction]);

  const hideControls = useCallback(() => {
    clearHideTimer();
    panelClosedByAutoHideRef.current = trackPanelOpenRef.current;
    setPreferredSettingsFocusKey('');
    setActiveSettingsPanel(null);
    setTrackPanelOpen(false);
    setControlsVisible(false);
  }, [clearHideTimer]);

  const openSettings = useCallback(() => {
    if (!showSettingsControl) return;
    clearHideTimer();
    panelClosedByAutoHideRef.current = false;
    setPreferredSettingsFocusKey('');
    setControlsVisible(true);
    setTrackPanelOpen(true);
    setActiveSettingsPanel(null);
  }, [clearHideTimer, showSettingsControl]);

  const closeSettings = useCallback(() => {
    setPreferredSettingsFocusKey('');
    setActiveSettingsPanel(null);
    setTrackPanelOpen(false);
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return clearHideTimer;
  }, [clearHideTimer, scheduleHide, trackPanelOpen]);

  useEffect(() => {
    onVisibilityChange?.(controlsVisibility);
  }, [controlsVisibility, onVisibilityChange]);

  useEffect(() => {
    onSettingsStateChange?.({ open: trackPanelOpen, panel: activeSettingsPanel });
  }, [activeSettingsPanel, onSettingsStateChange, trackPanelOpen]);

  useEffect(() => {
    if (!normalVisible || !showFocusedTooltips) setFocusedControlTooltip(null);
  }, [normalVisible, showFocusedTooltips]);

  useEffect(() => {
    if (!showFocusedTooltips || !focusedControlTooltip) return;
    const anchor = document.activeElement?.closest?.('[data-control-tooltip-anchor="true"]');
    const label = anchor?.getAttribute?.('data-control-tooltip-title');
    if (!label || label === focusedControlTooltip.label) return;
    showControlTooltip(label, anchor);
  }, [focusedControlTooltip, playing, showControlTooltip, showFocusedTooltips]);

  useEffect(() => {
    if (!trackPanelOpen || showSettingsControl) return;
    setPreferredSettingsFocusKey('');
    setActiveSettingsPanel(null);
    setTrackPanelOpen(false);
  }, [showSettingsControl, trackPanelOpen]);

  useEffect(() => {
    if (activeSettingsPanel === 'audio' && !hasAudioSettings) setActiveSettingsPanel(null);
    if ((activeSettingsPanel === 'subtitles' || activeSettingsPanel === 'appearance') && !hasSubtitleTracks) {
      setActiveSettingsPanel(null);
    }
  }, [activeSettingsPanel, hasAudioSettings, hasSubtitleTracks]);

  useEffect(() => {
    if (!shouldShowOverlayAction) {
      return undefined;
    }

    clearHideTimer();
    panelClosedByAutoHideRef.current = false;
    setPreferredSettingsFocusKey('');
    setActiveSettingsPanel(null);
    setTrackPanelOpen(false);
    setControlsVisible(false);
    const frame = window.requestAnimationFrame(() => {
      focusOverlayAction();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clearHideTimer, focusOverlayAction, shouldShowOverlayAction]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (trackPanelOpen) {
        const firstSummary = settingsOverlayRef.current?.querySelector('[data-settings-summary="true"]');
        firstSummary?.focus();
        return;
      }
      if (controlsVisible && !shouldShowOverlayAction) focusPlayToggle();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSettingsPanel, controlsVisible, focusPlayToggle, playable, shouldShowOverlayAction, trackPanelOpen]);

  useEffect(() => {
    if (!trackPanelOpen || !activeSettingsPanel) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const root = settingsOverlayRef.current;
      const preferred = preferredSettingsFocusKey
        ? root?.querySelector(`[data-settings-option-focus-key="${preferredSettingsFocusKey}"]`)
        : null;
      const selected = root?.querySelector('[data-settings-option-selected="true"]');
      (preferred || selected)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeSettingsPanel,
    preferredSettingsFocusKey,
    selectedAudio,
    selectedSubtitleValue,
    selectedSubtitleAppearance.size,
    selectedSubtitleAppearance.style,
    trackPanelOpen,
  ]);

  useEffect(() => {
    if (lastHideSignalRef.current === hideSignal) return;
    lastHideSignalRef.current = hideSignal;
    hideControls();
  }, [hideControls, hideSignal]);

  useEffect(() => {
    const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin'];
    for (const eventName of events) {
      document.addEventListener(eventName, revealControls, true);
    }
    return () => {
      for (const eventName of events) {
        document.removeEventListener(eventName, revealControls, true);
      }
    };
  }, [revealControls]);

  useEffect(() => {
    if (lastSettingsBackSignalRef.current === settingsBackSignal) return;
    lastSettingsBackSignalRef.current = settingsBackSignal;
    if (!trackPanelOpen) return;
    if (activeSettingsPanel) {
      setPreferredSettingsFocusKey('');
      setActiveSettingsPanel(null);
      return;
    }
    closeSettings();
  }, [activeSettingsPanel, closeSettings, settingsBackSignal, trackPanelOpen]);

  return (
    <>
      <Box
        ref={controlsRootRef}
        data-player-layout-density={layoutDensity}
        sx={{
          '--universal-primary-color': primaryColor,
          '--universal-primary-focus-bg': alphaColor(primaryColor, 0.82),
          '--universal-primary-focus-shadow': alphaColor(primaryColor, 0.24),
          '--universal-primary-input-focus-bg': alphaColor(primaryColor, 0.12),
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 8,
          color: '#fff',
          pointerEvents: 'none',
          opacity: visible ? 1 : 0,
          transition: 'opacity 180ms ease',
          background: trackPanelOpen
            ? 'rgba(0,0,0,.12)'
            : shouldShowOverlayAction
              ? 'transparent'
              : 'linear-gradient(to bottom, rgba(0,0,0,.56), rgba(0,0,0,0) 28%, rgba(0,0,0,0) 56%, rgba(0,0,0,.9))',
        }}
      >
        <Box sx={{ visibility: normalVisible ? 'visible' : 'hidden', pointerEvents: normalVisible ? 'auto' : 'none' }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ position: 'absolute', left: topInset, right: topInset, top: topOffset, zIndex: 12, pointerEvents: visible ? 'auto' : 'none' }}
        >
          <Stack direction="row" alignItems="center" spacing={controlSpacing}>
            {showBackButton && onBack && (
              <ControlTooltip
                title={tooltipLabels.back}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <IconButton data-tv-focusable="true" onClick={onBack} sx={iconButtonSx}>
                  <ArrowBackRoundedIcon fontSize="large" />
                </IconButton>
              </ControlTooltip>
            )}
            {showRestartControl && (
              <ControlTooltip
                title={tooltipLabels.reload}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <IconButton data-tv-focusable="true" onClick={onReload} sx={iconButtonSx}>
                  <ReplayRoundedIcon fontSize="large" />
                </IconButton>
              </ControlTooltip>
            )}
          </Stack>

          {showTopMetadata && (
            <Box sx={{ position: 'absolute', left: '22%', right: '22%', top: 4, textAlign: 'center' }}>
              {title && <Typography sx={{ fontSize: { xs: 18, md: 22 }, fontWeight: 800 }}>{title}</Typography>}
              {subtitle && <Typography sx={{ fontSize: { xs: 14, md: 18 }, fontWeight: 700 }}>{subtitle}</Typography>}
            </Box>
          )}

          <Stack direction="row" alignItems="center" spacing={controlSpacing}>
            {channelLogo && !isLive && !isConstrainedLayout && (
              <Box
                component="img"
                src={channelLogo}
                alt=""
                sx={{ maxWidth: 86, maxHeight: 46, objectFit: 'contain', filter: 'drop-shadow(0 2px 3px #000)' }}
              />
            )}
            {showSettingsControl && (
              <ControlTooltip
                title={tooltipLabels.settings}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <IconButton
                  data-tv-focusable="true"
                  onClick={openSettings}
                  sx={iconButtonSx}
                >
                  <MessageSharpIcon fontSize="large" />
                </IconButton>
              </ControlTooltip>
            )}
            {showResizeModeControl && (
              <ControlTooltip
                title={resizeModeTooltip}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <IconButton
                  data-tv-focusable="true"
                  aria-label={resizeModeTooltip}
                  onClick={onToggleResizeMode}
                  sx={iconButtonSx}
                >
                  <AspectRatioRoundedIcon fontSize="large" />
                </IconButton>
              </ControlTooltip>
            )}
            {showPictureInPictureControl && (
              <ControlTooltip
                title={pictureInPictureTooltip}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <IconButton
                  data-tv-focusable="true"
                  aria-pressed={pictureInPictureActive ? 'true' : 'false'}
                  onClick={onPictureInPicture}
                  sx={{
                    ...iconButtonSx,
                    ...(pictureInPictureActive ? { bgcolor: alphaColor(primaryColor, 0.34) } : {}),
                  }}
                >
                  <PictureInPictureAltRoundedIcon fontSize="large" />
                </IconButton>
              </ControlTooltip>
            )}
            {showFullscreenControl && (
              <ControlTooltip
                title={tooltipLabels.fullscreen}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <IconButton data-tv-focusable="true" onClick={onFullscreen} sx={iconButtonSx}>
                  <FullscreenRoundedIcon fontSize="large" />
                </IconButton>
              </ControlTooltip>
            )}
          </Stack>
        </Stack>

        {!isLive && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            spacing={centerSpacing}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 10,
              pointerEvents: visible ? 'auto' : 'none',
            }}
          >
            {showSeekControls && (
              <ControlTooltip
                title={rewindTooltip}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <span>
                  <IconButton data-tv-focusable="true" disabled={!playable} onClick={onJumpBackward} sx={iconButtonSx}>
                    <RewindIcon sx={{ fontSize: seekIconSize }} />
                  </IconButton>
                </span>
              </ControlTooltip>
            )}
            <ControlTooltip
              title={playPauseTooltip}
              showFocusedTooltip={showFocusedTooltips}
              onShowFocusedTooltip={showControlTooltip}
              onHideFocusedTooltip={hideControlTooltip}
            >
              <span>
                <IconButton ref={playToggleRef} data-tv-focusable="true" disabled={!playable} onClick={onToggle} sx={iconButtonSx}>
                  {playing ? <PauseRoundedIcon sx={{ fontSize: playIconSize }} /> : <PlayArrowRoundedIcon sx={{ fontSize: playIconSize }} />}
                </IconButton>
              </span>
            </ControlTooltip>
            {showSeekControls && (
              <ControlTooltip
                title={forwardTooltip}
                showFocusedTooltip={showFocusedTooltips}
                onShowFocusedTooltip={showControlTooltip}
                onHideFocusedTooltip={hideControlTooltip}
              >
                <span>
                  <IconButton data-tv-focusable="true" disabled={!playable} onClick={onJumpForward} sx={iconButtonSx}>
                    <ForwardIcon sx={{ fontSize: seekIconSize }} />
                  </IconButton>
                </span>
              </ControlTooltip>
            )}
          </Stack>
        )}

        {showLiveInfoPanel && (
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 'clamp(100px, 18%, 184px)',
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 1.25, sm: 2, md: 3.5 },
              px: { xs: 1.5, sm: 2.5, md: 4 },
              py: { xs: 1.25, md: 2 },
              background: 'linear-gradient(90deg, rgba(12,14,18,.78), rgba(12,14,18,.62) 72%, rgba(12,14,18,.5))',
              borderTop: '1px solid rgba(255,255,255,.12)',
              pointerEvents: 'none',
            }}
          >
            <Box
              sx={{
                width: channelLogo ? { xs: 'clamp(76px, 14vw, 150px)', md: 'clamp(120px, 14vw, 220px)' } : 0,
                height: '100%',
                flex: channelLogo ? '0 0 auto' : '0 0 0px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {channelLogo && (
                <Box
                  component="img"
                  src={channelLogo}
                  alt=""
                  sx={{
                    width: 'auto',
                    maxWidth: '100%',
                    maxHeight: '76%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 2px 4px #000)',
                  }}
                />
              )}
            </Box>

            <Box
              sx={{
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minWidth: 0,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                {liveChannelLabel && (
                  <Typography
                    sx={{
                      fontSize: 'clamp(18px, 2.5vw, 42px)',
                      lineHeight: 1.05,
                      fontWeight: 900,
                      textShadow: '0 2px 4px #000',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {liveChannelLabel}
                  </Typography>
                )}
                {showLiveBadge && (
                  <Typography
                    sx={{
                      px: 0.7,
                      py: 0.18,
                      bgcolor: primaryColor,
                      borderRadius: 0.6,
                      fontSize: 'clamp(10px, .7vw, 14px)',
                      lineHeight: 1.2,
                      fontWeight: 900,
                      flex: '0 0 auto',
                    }}
                  >
                    EN VIVO
                  </Typography>
                )}
              </Stack>
              {liveMetaLabel && (
                <Typography
                  sx={{
                    mt: { xs: 0.4, md: 0.7 },
                    fontSize: 'clamp(12px, 1.05vw, 20px)',
                    lineHeight: 1.1,
                    fontWeight: 800,
                    color: 'rgba(255,255,255,.92)',
                    textShadow: '0 2px 4px #000',
                  }}
                >
                  {liveMetaLabel}
                </Typography>
              )}
              {liveTitleLabel && (
                <Typography
                  sx={{
                    mt: { xs: 0.4, md: 0.7 },
                    fontSize: 'clamp(14px, 1.45vw, 28px)',
                    lineHeight: 1.1,
                    fontWeight: 900,
                    textShadow: '0 2px 4px #000',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {liveTitleLabel}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {showInlineChannelMeta && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ position: 'absolute', left: 28, bottom: 92, pointerEvents: 'none' }}
          >
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                {channelName && <Typography sx={{ fontSize: 24, fontWeight: 900 }}>{channelName}</Typography>}
              </Stack>
              {epgTime && <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{epgTime}</Typography>}
              {epgTitle && <Typography sx={{ fontSize: 20, fontWeight: 900 }}>{epgTitle}</Typography>}
            </Box>
          </Stack>
        )}

        {!isLive && (
        <Box
          data-player-progress-focused={progressFocused ? 'true' : undefined}
          sx={{
            position: 'absolute',
            left: progressInset,
            right: progressInset,
            bottom: progressBottom,
            zIndex: 12,
            pointerEvents: visible ? 'auto' : 'none',
            px: progressFocused ? { xs: 1.1, md: 1.6 } : 0,
            py: progressFocused ? { xs: 0.8, md: 1 } : 0,
            mx: progressFocused ? { xs: -1.1, md: -1.6 } : 0,
            mb: progressFocused ? { xs: -0.8, md: -1 } : 0,
            borderRadius: 1.25,
            bgcolor: progressFocused ? 'rgba(15,18,26,.78)' : 'transparent',
            boxShadow: progressFocused
              ? `0 0 0 3px ${alphaColor(primaryColor, 0.72)}, 0 12px 34px rgba(0,0,0,.52)`
              : 'none',
            transition: 'background-color 120ms ease, box-shadow 120ms ease, padding 120ms ease, margin 120ms ease',
          }}
        >
          <Slider
            data-tv-focusable={isMiniLayout ? undefined : 'true'}
            data-player-progress="true"
            aria-label="Barra de progreso"
            min={0}
            max={maxDuration}
            value={Math.min(displayedTime, maxDuration)}
            disabled={!playable}
            onFocusCapture={() => setProgressFocused(true)}
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (!nextTarget || !event.currentTarget.contains(nextTarget)) setProgressFocused(false);
            }}
            onKeyDownCapture={(event) => {
              if (!queueKeyboardSeek(getProgressArrowDirection(event))) return;
              event.preventDefault();
              event.stopPropagation();
            }}
            onChange={(event, value) => {
              if (queueKeyboardSeek(getProgressArrowDirection(event))) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              cancelKeyboardSeek();
              setScrubValue(Number(value));
            }}
            onChangeCommitted={(event, value) => {
              if (onProgressSeek && Number(progressSeekStep) > 0 && getProgressArrowDirection(event)) return;
              setScrubValue(null);
              onSeek?.(Number(value));
            }}
            size="small"
            sx={{
              color: primaryColor,
              py: progressFocused ? 0.45 : 0,
              '& .MuiSlider-track': {
                border: 0,
                height: progressFocused ? 8 : 4,
                transition: 'height 120ms ease',
              },
              '& .MuiSlider-rail': {
                color: progressFocused ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.62)',
                height: progressFocused ? 8 : 4,
                opacity: 1,
                transition: 'height 120ms ease, color 120ms ease',
              },
              '& .MuiSlider-thumb': {
                width: progressFocused ? (isMiniLayout ? 14 : 24) : (isMiniLayout ? 10 : 16),
                height: progressFocused ? (isMiniLayout ? 14 : 24) : (isMiniLayout ? 10 : 16),
                bgcolor: '#fff',
                border: progressFocused ? `4px solid ${primaryColor}` : '0 solid transparent',
                boxShadow: progressFocused ? `0 0 0 7px ${alphaColor(primaryColor, 0.28)}` : 'none',
                transition: 'width 120ms ease, height 120ms ease, border 120ms ease, box-shadow 120ms ease',
              },
              '&:focus-visible, &.Mui-focusVisible, &.tv-remote-focused': {
                outline: 'none !important',
                boxShadow: 'none !important',
              },
            }}
          />
          {!isMiniLayout && (
          <Stack data-progress-meta="true" direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography sx={{ fontSize: { xs: 16, md: 22 }, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(displayedTime)}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1.25}>
              {showProgressSeekHint && (
                <Typography
                  data-progress-step-hint="true"
                  sx={{
                    px: progressFocused ? 1 : 0,
                    py: progressFocused ? 0.4 : 0,
                    borderRadius: 0.75,
                    bgcolor: progressFocused ? alphaColor(primaryColor, 0.86) : 'transparent',
                    fontSize: { xs: 12, md: 16 },
                    fontWeight: 900,
                    color: progressFocused ? '#fff' : 'rgba(255,255,255,.78)',
                    textShadow: progressFocused ? '0 1px 3px #000' : 'none',
                  }}
                >
                  ◀/▶ ±5 min
                </Typography>
              )}
              <Typography sx={{ fontSize: { xs: 16, md: 22 }, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(duration)}
              </Typography>
            </Stack>
          </Stack>
          )}
        </Box>
        )}
        </Box>

        {shouldShowOverlayAction && (
          <Box
            data-overlay-action-layer="true"
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 40,
              pointerEvents: 'auto',
            }}
          >
            {shouldShowSegmentAction && (
              <Button
                ref={segmentActionButtonRef}
                variant="outlined"
                data-tv-focusable="true"
                data-segment-action-button="true"
                endIcon={<KeyboardArrowRightRoundedIcon sx={{ fontSize: { xs: 25, md: 30 } }} />}
                onClick={segmentAction.onPress}
                sx={{
                  position: 'absolute',
                  right: { xs: 22, md: 38 },
                  top: { xs: 24, md: 38 },
                  minWidth: { xs: 198, md: 246 },
                  minHeight: { xs: 50, md: 58 },
                  px: { xs: 1.75, md: 2.25 },
                  justifyContent: 'space-between',
                  borderRadius: 1.25,
                  borderWidth: 2,
                  borderColor: primaryColor,
                  color: '#fff',
                  background: segmentActionButtonBackground,
                  backgroundColor: '#050505',
                  boxShadow: '0 12px 30px rgba(0,0,0,.38)',
                  fontSize: { xs: 16, md: 20 },
                  lineHeight: 1.1,
                  fontWeight: 900,
                  textTransform: 'none',
                  overflow: 'hidden',
                  isolation: 'isolate',
                  '& .MuiButton-endIcon': {
                    ml: 1,
                    mr: -0.35,
                    flex: '0 0 auto',
                  },
                  '&:focus-visible, &.Mui-focusVisible, &[data-tv-focused="true"], &.tv-remote-focused': {
                    outline: 'none',
                    borderColor: '#fff',
                    background: segmentActionButtonBackground,
                    backgroundColor: '#050505',
                    boxShadow: `0 0 0 5px ${alphaColor(primaryColor, 0.34)}, 0 14px 32px rgba(0,0,0,.48)`,
                  },
                  '&:hover': {
                    borderColor: '#fff',
                    background: segmentActionButtonBackground,
                    backgroundColor: '#050505',
                  },
                }}
              >
                {segmentAction.label || tooltipLabels.nextEpisode}
              </Button>
            )}

            {shouldShowAutoContinue && (
              <Button
                ref={autoContinueButtonRef}
                variant="outlined"
                data-tv-focusable="true"
                data-next-episode-button="true"
                endIcon={<KeyboardArrowRightRoundedIcon sx={{ fontSize: { xs: 28, md: 34 } }} />}
                onClick={autoContinue.onPress}
                sx={{
                  position: 'absolute',
                  right: { xs: 22, md: 38 },
                  bottom: { xs: 44, md: 58 },
                  minWidth: { xs: 232, md: 288 },
                  minHeight: { xs: 58, md: 66 },
                  px: { xs: 2, md: 2.5 },
                  justifyContent: 'space-between',
                  borderRadius: 1.25,
                  borderWidth: 2,
                  borderColor: primaryColor,
                  color: '#fff',
                  background: autoContinueButtonBackground,
                  backgroundColor: '#050505',
                  boxShadow: '0 12px 30px rgba(0,0,0,.42)',
                  fontSize: { xs: 18, md: 22 },
                  lineHeight: 1.1,
                  fontWeight: 900,
                  textTransform: 'none',
                  overflow: 'hidden',
                  isolation: 'isolate',
                  '& .MuiButton-endIcon': {
                    ml: 1.25,
                    mr: -0.4,
                    flex: '0 0 auto',
                  },
                  '&:focus-visible, &.Mui-focusVisible, &[data-tv-focused="true"], &.tv-remote-focused': {
                    outline: 'none',
                    borderColor: '#fff',
                    background: autoContinueButtonBackground,
                    backgroundColor: '#050505',
                    boxShadow: `0 0 0 5px ${alphaColor(primaryColor, 0.34)}, 0 14px 32px rgba(0,0,0,.48)`,
                  },
                  '&:hover': {
                    borderColor: '#fff',
                    background: autoContinueButtonBackground,
                    backgroundColor: '#050505',
                  },
                }}
              >
                {autoContinue.label || tooltipLabels.nextEpisode}
              </Button>
            )}
          </Box>
        )}

        {showFocusedTooltips && normalVisible && focusedControlTooltip?.label && (
          <Box
            sx={{
              position: 'absolute',
              left: focusedControlTooltip.x,
              top: focusedControlTooltip.y,
              zIndex: 50,
              transform: focusedControlTooltip.showAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              px: 1.25,
              py: 0.65,
              maxWidth: 240,
              borderRadius: 0.75,
              bgcolor: 'rgba(17,19,25,.94)',
              border: '1px solid rgba(255,255,255,.34)',
              color: '#fff',
              fontSize: { xs: 13, md: 16 },
              fontWeight: 800,
              lineHeight: 1.15,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              boxShadow: '0 8px 22px rgba(0,0,0,.42)',
              pointerEvents: 'none',
            }}
          >
            {focusedControlTooltip.label}
          </Box>
        )}
      </Box>

      {trackPanelOpen && (
        <Box
          ref={settingsOverlayRef}
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 30,
            color: '#fff',
            px: { xs: 1.5, sm: 3, md: 5 },
            pb: { xs: 1.5, sm: 3, md: 4 },
            display: 'flex',
            alignItems: 'flex-end',
            pointerEvents: 'auto',
          }}
        >
          {showSettingsBackButton && (
            <Tooltip title={tooltipLabels.backToControls}>
              <IconButton
                data-tv-focusable="true"
                onClick={closeSettings}
                sx={{
                  position: 'absolute',
                  left: { xs: 18, md: 28 },
                  top: { xs: 14, md: 20 },
                  color: '#fff',
                  bgcolor: 'rgba(17,19,25,.72)',
                  border: '1px solid rgba(255,255,255,.42)',
                  ...focusRingSx,
                  '&:hover': {
                    bgcolor: 'rgba(17,19,25,.92)',
                    borderColor: primaryColor,
                  },
                }}
              >
                <ArrowBackRoundedIcon fontSize="large" />
              </IconButton>
            </Tooltip>
          )}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 1.2, md: 2 }}
            sx={{
              width: { xs: '100%', md: 'auto' },
              maxWidth: '100%',
              mx: 'auto',
              alignItems: { xs: 'stretch', md: 'flex-end' },
              justifyContent: 'center',
            }}
          >
            {hasSubtitleTracks && (
              <Box sx={settingsItemSx}>
                {activeSettingsPanel === 'subtitles' && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 'calc(100% + 12px)',
                      p: { xs: 1, md: 1.4 },
                      border: '2px solid rgba(255,255,255,.65)',
                      borderRadius: 1.5,
                      bgcolor: 'rgba(24,27,36,.96)',
                      boxShadow: '0 10px 34px rgba(0,0,0,.52)',
                    }}
                  >
                    <Typography sx={{ px: 1, pb: 0.8, fontSize: { xs: 15, md: 18 }, fontWeight: 900 }}>
                      {tooltipLabels.subtitles}
                    </Typography>
                    <SettingsOptionList
                      panel="subtitles"
                      options={subtitleList}
                      selected={selectedSubtitleValue}
                      primaryColor={primaryColor}
                      labels={tooltipLabels}
                      onSelect={(value, focusKey) => {
                        setPreferredSettingsFocusKey(focusKey);
                        onSelectSubtitle?.(value);
                        scheduleHide();
                      }}
                    />
                  </Box>
                )}
                <SettingsSummaryCard
                  title={tooltipLabels.subtitles}
                  value={selectedSubtitleLabel}
                  icon={<SubtitlesRoundedIcon sx={{ fontSize: { xs: 19, md: 24 }, color: primaryColor }} />}
                  active={activeSettingsPanel === 'subtitles'}
                  primaryColor={primaryColor}
                  focusRingSx={focusRingSx}
                  onClick={() => {
                    setPreferredSettingsFocusKey('');
                    setActiveSettingsPanel((current) => current === 'subtitles' ? null : 'subtitles');
                  }}
                />
              </Box>
            )}

            {hasAudioSettings && (
              <Box sx={settingsItemSx}>
                {activeSettingsPanel === 'audio' && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 'calc(100% + 12px)',
                      p: { xs: 1, md: 1.4 },
                      border: '2px solid rgba(255,255,255,.65)',
                      borderRadius: 1.5,
                      bgcolor: 'rgba(24,27,36,.96)',
                      boxShadow: '0 10px 34px rgba(0,0,0,.52)',
                    }}
                  >
                    <Typography sx={{ px: 1, pb: 0.8, fontSize: { xs: 15, md: 18 }, fontWeight: 900 }}>
                      {tooltipLabels.audioLanguage}
                    </Typography>
                    <SettingsOptionList
                      panel="audio"
                      options={audioOptions}
                      selected={selectedAudio}
                      primaryColor={primaryColor}
                      labels={tooltipLabels}
                      onSelect={(value, focusKey) => {
                        setPreferredSettingsFocusKey(focusKey);
                        onSelectAudio?.(value);
                        scheduleHide();
                      }}
                    />
                  </Box>
                )}
                <SettingsSummaryCard
                  title={tooltipLabels.audioLanguage}
                  value={selectedAudioLabel}
                  icon={<GraphicEqRoundedIcon sx={{ fontSize: { xs: 19, md: 24 }, color: primaryColor }} />}
                  active={activeSettingsPanel === 'audio'}
                  primaryColor={primaryColor}
                  focusRingSx={focusRingSx}
                  onClick={() => {
                    setPreferredSettingsFocusKey('');
                    setActiveSettingsPanel((current) => current === 'audio' ? null : 'audio');
                  }}
                />
              </Box>
            )}

            {hasSubtitleTracks && (
              <Box sx={settingsItemSx}>
                {activeSettingsPanel === 'appearance' && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 'calc(100% + 12px)',
                      p: { xs: 1, md: 1.4 },
                      border: '2px solid rgba(255,255,255,.65)',
                      borderRadius: 1.5,
                      bgcolor: 'rgba(24,27,36,.96)',
                      boxShadow: '0 10px 34px rgba(0,0,0,.52)',
                    }}
                  >
                    <Typography sx={{ px: 1, pb: 0.8, fontSize: { xs: 15, md: 18 }, fontWeight: 900 }}>
                      {tooltipLabels.subtitleAppearance}
                    </Typography>
                    <SettingsAppearanceList
                      appearance={selectedSubtitleAppearance}
                      primaryColor={primaryColor}
                      labels={tooltipLabels}
                      onSelect={(value, focusKey) => {
                        setPreferredSettingsFocusKey(focusKey);
                        onSubtitleAppearanceChange?.(value);
                        scheduleHide();
                      }}
                    />
                  </Box>
                )}
                <SettingsSummaryCard
                  title={tooltipLabels.subtitleAppearance}
                  value={appearanceLabel}
                  icon={<FormatSizeRoundedIcon sx={{ fontSize: { xs: 19, md: 24 }, color: primaryColor }} />}
                  active={activeSettingsPanel === 'appearance'}
                  primaryColor={primaryColor}
                  focusRingSx={focusRingSx}
                  onClick={() => {
                    setPreferredSettingsFocusKey('');
                    setActiveSettingsPanel((current) => current === 'appearance' ? null : 'appearance');
                  }}
                />
              </Box>
            )}
          </Stack>
        </Box>
      )}
    </>
  );
}
