import {
  FileTerminal,
  GitBranch,
  LayoutDashboard,
  ListTree,
  type LucideIcon,
  Settings,
} from 'lucide-react';

export interface NavigationItem {
  icon: LucideIcon;
  label: string;
  to: string;
}

export interface NavigationSection {
  items: NavigationItem[];
  label: string;
}

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface PageMeta {
  breadcrumbs: BreadcrumbItem[];
  description: string;
  section: string;
  title: string;
}

export const navigationSections: NavigationSection[] = [
  {
    label: '모니터링',
    items: [
      { to: '/', label: '대시보드', icon: LayoutDashboard },
      { to: '/traces', label: '요청 추적', icon: ListTree },
      { to: '/logs', label: '로그 기록', icon: FileTerminal },
      { to: '/exemplars', label: 'Exemplars', icon: GitBranch },
    ],
  },
  {
    label: '시스템',
    items: [{ to: '/settings', label: '설정', icon: Settings }],
  },
];

export function getPageMeta(pathname: string): PageMeta {
  if (pathname === '/') {
    return {
      title: '대시보드',
      section: 'Monitoring',
      description: '시스템 전체 상태를 요약해서 보여줍니다.',
      breadcrumbs: [{ label: '모니터링' }, { label: '대시보드' }],
    };
  }

  if (pathname === '/traces') {
    return {
      title: '요청 추적',
      section: 'Monitoring',
      description: '서비스 간 요청 흐름과 병목 구간을 조회합니다.',
      breadcrumbs: [{ label: '모니터링' }, { label: '요청 추적' }],
    };
  }

  if (pathname.startsWith('/traces/')) {
    const traceId = pathname.split('/')[2];

    return {
      title: '트레이스 상세',
      section: 'Monitoring',
      description: '선택한 요청의 span 타임라인과 속성을 확인합니다.',
      breadcrumbs: [
        { label: '모니터링' },
        { label: '요청 추적', to: '/traces' },
        { label: traceId ? `${traceId.slice(0, 8)}...` : '트레이스 상세' },
      ],
    };
  }

  if (pathname.startsWith('/services/')) {
    const serviceName = decodeURIComponent(pathname.split('/')[2] || '');

    return {
      title: serviceName || '서비스 상세',
      section: 'Monitoring',
      description: '서비스의 성능 지표와 최근 트레이스, 로그를 확인합니다.',
      breadcrumbs: [
        { label: '모니터링' },
        { label: '대시보드', to: '/' },
        { label: serviceName || '서비스 상세' },
      ],
    };
  }

  if (pathname === '/logs') {
    return {
      title: '로그 기록',
      section: 'Monitoring',
      description: '실시간 로그와 trace 연결 정보를 확인합니다.',
      breadcrumbs: [{ label: '모니터링' }, { label: '로그 기록' }],
    };
  }

  if (pathname === '/exemplars') {
    return {
      title: 'Exemplars',
      section: 'Monitoring',
      description: '메트릭-트레이스 상관관계를 Exemplar 포인트로 분석합니다.',
      breadcrumbs: [{ label: '모니터링' }, { label: 'Exemplars' }],
    };
  }

  if (pathname === '/settings') {
    return {
      title: '설정',
      section: 'System',
      description: '운영 설정 화면의 범위와 예정 항목을 확인합니다.',
      breadcrumbs: [{ label: '시스템' }, { label: '설정' }],
    };
  }

  return {
    title: '페이지 없음',
    section: 'System',
    description: '존재하지 않는 경로입니다.',
    breadcrumbs: [{ label: '시스템' }, { label: '페이지 없음' }],
  };
}
