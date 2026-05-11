"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageContainer,
  PageSection,
  PageCard,
  PageEmptyState,
} from "@/components/layout";

// Icons for the demo
const Icons = {
  plus: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  download: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  folder: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  users: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  arrowRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

// Sample data for the demo
const stats = [
  { label: "Active Projects", value: "12", change: "+2", icon: Icons.folder },
  { label: "Tasks Completed", value: "48", change: "+12", icon: Icons.check },
  { label: "Hours Logged", value: "164", change: "+8", icon: Icons.clock },
  { label: "Team Members", value: "8", change: "+1", icon: Icons.users },
];

const recentProjects = [
  { name: "Website Redesign", status: "In Progress", tasks: 24, completed: 18 },
  { name: "Mobile App v2.0", status: "Planning", tasks: 12, completed: 0 },
  { name: "API Integration", status: "In Review", tasks: 8, completed: 7 },
  { name: "Documentation", status: "In Progress", tasks: 15, completed: 10 },
];

const recentTasks = [
  { title: "Update user dashboard", project: "Website Redesign", priority: "High", dueDate: "Today" },
  { title: "Review API endpoints", project: "API Integration", priority: "Medium", dueDate: "Tomorrow" },
  { title: "Write unit tests", project: "Mobile App v2.0", priority: "Low", dueDate: "Jan 30" },
  { title: "Update README", project: "Documentation", priority: "Low", dueDate: "Jan 31" },
];

function StatCard({ stat }: { stat: typeof stats[0] }) {
  const Icon = stat.icon;
  return (
    <PageCard className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{stat.value}</p>
        <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
          {stat.change} this week
        </p>
      </div>
      <div className="rounded-lg bg-primary/10 p-3">
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </PageCard>
  );
}

function ProjectCard({ project }: { project: typeof recentProjects[0] }) {
  const progress = project.tasks > 0 ? (project.completed / project.tasks) * 100 : 0;
  
  return (
    <div className="group flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-medium">{project.name}</h4>
          <Badge
            variant={
              project.status === "In Progress"
                ? "default"
                : project.status === "Planning"
                ? "secondary"
                : "outline"
            }
            className="text-xs"
          >
            {project.status}
          </Badge>
        </div>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{project.completed}/{project.tasks} tasks</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="opacity-0 transition-opacity group-hover:opacity-100">
        <Icons.arrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function TaskRow({ task }: { task: typeof recentTasks[0] }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{task.title}</p>
        <p className="text-sm text-muted-foreground">{task.project}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge
          variant={
            task.priority === "High"
              ? "destructive"
              : task.priority === "Medium"
              ? "default"
              : "secondary"
          }
          className="text-xs"
        >
          {task.priority}
        </Badge>
        <span className="w-20 text-right text-sm text-muted-foreground">
          {task.dueDate}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PageContainer
      title="Dashboard"
      description="Welcome back! Here's what's happening with your projects."
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Dashboard" },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Icons.download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm">
            <Icons.plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </>
      }
    >
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Recent Projects */}
        <PageSection
          title="Recent Projects"
          description="Your most recently updated projects"
          actions={
            <Button variant="ghost" size="sm">
              View all
            </Button>
          }
        >
          <div className="space-y-3">
            {recentProjects.map((project) => (
              <ProjectCard key={project.name} project={project} />
            ))}
          </div>
        </PageSection>

        {/* Recent Tasks */}
        <PageSection
          title="Upcoming Tasks"
          description="Tasks due in the next 7 days"
          actions={
            <Button variant="ghost" size="sm">
              View all
            </Button>
          }
        >
          <PageCard className="divide-y divide-border">
            {recentTasks.map((task) => (
              <TaskRow key={task.title} task={task} />
            ))}
          </PageCard>
        </PageSection>
      </div>

      {/* Empty State Example (commented out for demo) */}
      {/* 
      <PageSection title="Empty State Example" className="mt-8">
        <PageCard>
          <PageEmptyState
            icon={<Icons.folder className="h-8 w-8" />}
            title="No projects yet"
            description="Get started by creating your first project. Projects help you organize tasks and collaborate with your team."
            action={
              <Button>
                <Icons.plus className="mr-2 h-4 w-4" />
                Create Project
              </Button>
            }
          />
        </PageCard>
      </PageSection>
      */}
    </PageContainer>
  );
}

