"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageContainer,
  PageCard,
} from "@/components/layout";

const Icons = {
  plus: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  filter: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  folder: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  moreVertical: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
};

const projects = [
  {
    id: 1,
    name: "Website Redesign",
    description: "Complete overhaul of the company website with new branding",
    status: "In Progress",
    members: 5,
    tasks: { total: 24, completed: 18 },
    dueDate: "Feb 15, 2026",
    color: "bg-blue-500",
  },
  {
    id: 2,
    name: "Mobile App v2.0",
    description: "Major update with new features and performance improvements",
    status: "Planning",
    members: 8,
    tasks: { total: 42, completed: 0 },
    dueDate: "Mar 30, 2026",
    color: "bg-purple-500",
  },
  {
    id: 3,
    name: "API Integration",
    description: "Integration with third-party services and payment providers",
    status: "In Review",
    members: 3,
    tasks: { total: 8, completed: 7 },
    dueDate: "Jan 31, 2026",
    color: "bg-green-500",
  },
  {
    id: 4,
    name: "Documentation",
    description: "Comprehensive documentation for developers and end users",
    status: "In Progress",
    members: 2,
    tasks: { total: 15, completed: 10 },
    dueDate: "Feb 28, 2026",
    color: "bg-orange-500",
  },
  {
    id: 5,
    name: "Security Audit",
    description: "Complete security review and penetration testing",
    status: "Planning",
    members: 4,
    tasks: { total: 20, completed: 0 },
    dueDate: "Apr 15, 2026",
    color: "bg-red-500",
  },
  {
    id: 6,
    name: "Data Migration",
    description: "Migrate legacy data to new database structure",
    status: "Completed",
    members: 3,
    tasks: { total: 12, completed: 12 },
    dueDate: "Jan 15, 2026",
    color: "bg-teal-500",
  },
];

function ProjectCard({ project }: { project: typeof projects[0] }) {
  const progress = (project.tasks.completed / project.tasks.total) * 100;

  return (
    <PageCard className="group relative overflow-hidden transition-shadow hover:shadow-md">
      {/* Color accent */}
      <div className={`absolute left-0 top-0 h-1 w-full ${project.color}`} />
      
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${project.color}/10`}>
            <Icons.folder className={`h-5 w-5 ${project.color.replace('bg-', 'text-')}`} />
          </div>
          <div>
            <h3 className="font-semibold">{project.name}</h3>
            <p className="text-sm text-muted-foreground">{project.members} members</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100">
          <Icons.moreVertical className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-4 line-clamp-2 text-sm text-muted-foreground">
        {project.description}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <Badge
          variant={
            project.status === "Completed"
              ? "default"
              : project.status === "In Progress"
              ? "secondary"
              : project.status === "In Review"
              ? "outline"
              : "secondary"
          }
        >
          {project.status}
        </Badge>
        <span className="text-sm text-muted-foreground">{project.dueDate}</span>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${project.color}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </PageCard>
  );
}

export default function ProjectsPage() {
  return (
    <PageContainer
      title="Projects"
      description="Manage and track all your projects in one place."
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Projects" },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm">
            <Icons.filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button size="sm">
            <Icons.plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </PageContainer>
  );
}

