{{/*
Expand the name of the chart.
*/}}
{{- define "lamdis.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "lamdis.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "lamdis.labels" -}}
helm.sh/chart: {{ include "lamdis.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: lamdis
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Selector labels for a specific component
*/}}
{{- define "lamdis.selectorLabels" -}}
app.kubernetes.io/name: {{ include "lamdis.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Image reference for a component
*/}}
{{- define "lamdis.image" -}}
{{ .registry }}/{{ .image }}:{{ .tag }}
{{- end }}

{{/*
MongoDB URI — internal or external
*/}}
{{- define "lamdis.mongoUri" -}}
{{- if .Values.mongodb.enabled }}
mongodb://{{ include "lamdis.fullname" . }}-mongodb:27017/lamdis
{{- else }}
{{- .Values.mongodb.externalUri }}
{{- end }}
{{- end }}
