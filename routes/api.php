<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| CRM API Route Map (Laravel-style reference)
|--------------------------------------------------------------------------
| This file mirrors the Node API routes in server/src/http/routes.ts
| for teams that want a Laravel-like overview.
*/

// Auth
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/verify-email', [AuthController::class, 'verifyEmail']);
Route::get('/auth/google/start', [AuthController::class, 'googleStart']);
Route::post('/auth/google/callback', [AuthController::class, 'googleCallback']);
Route::get('/user', [AuthController::class, 'me'])->middleware('auth:sanctum');

// Admin
Route::post('/admin/bootstrap', [AdminController::class, 'bootstrap']);
Route::get('/admin/overview', [AdminController::class, 'overview'])->middleware('auth:sanctum');
Route::get('/admin/companies/{id}/users', [AdminController::class, 'companyUsers'])->middleware('auth:sanctum');
Route::get('/admin/companies/{id}/metrics', [AdminController::class, 'companyMetrics'])->middleware('auth:sanctum');
Route::post('/admin/invitations', [AdminController::class, 'invite'])->middleware('auth:sanctum');
Route::get('/admin/invitations', [AdminController::class, 'listInvites'])->middleware('auth:sanctum');
Route::post('/invitations/accept', [AdminController::class, 'acceptInvite']);

// Email
Route::post('/email/send', [EmailController::class, 'send'])->middleware('auth:sanctum');
Route::post('/email/sync', [EmailController::class, 'sync'])->middleware('auth:sanctum');

// Leads
Route::post('/leads', [LeadController::class, 'create'])->middleware('auth:sanctum');
Route::get('/leads', [LeadController::class, 'list'])->middleware('auth:sanctum');
Route::post('/leads/import', [LeadController::class, 'import'])->middleware('auth:sanctum');
Route::patch('/leads/{id}/score', [LeadController::class, 'score'])->middleware('auth:sanctum');

// Deals + Pipeline
Route::post('/deals', [DealController::class, 'create'])->middleware('auth:sanctum');
Route::get('/deals', [DealController::class, 'list'])->middleware('auth:sanctum');
Route::patch('/deals/{id}/stage', [DealController::class, 'updateStage'])->middleware('auth:sanctum');
Route::get('/pipeline/stages', [PipelineController::class, 'stages'])->middleware('auth:sanctum');
Route::get('/pipeline/summary', [PipelineController::class, 'summary'])->middleware('auth:sanctum');

// Tasks
Route::post('/tasks', [TaskController::class, 'create'])->middleware('auth:sanctum');
Route::get('/tasks', [TaskController::class, 'list'])->middleware('auth:sanctum');
Route::patch('/tasks/{id}', [TaskController::class, 'update'])->middleware('auth:sanctum');

// Dashboard
Route::get('/dashboard', [DashboardController::class, 'summary'])->middleware('auth:sanctum');

// Inbox + Messages
Route::post('/messages', [MessageController::class, 'send'])->middleware('auth:sanctum');
Route::get('/inbox', [InboxController::class, 'index'])->middleware('auth:sanctum');
Route::patch('/inbox/messages/{id}/read', [InboxController::class, 'readMessage'])->middleware('auth:sanctum');
Route::patch('/inbox/notifications/{id}/read', [InboxController::class, 'readNotification'])->middleware('auth:sanctum');

// Calendar
Route::post('/calendar/events', [CalendarController::class, 'create'])->middleware('auth:sanctum');
Route::get('/calendar/my', [CalendarController::class, 'my'])->middleware('auth:sanctum');
Route::get('/calendar/company', [CalendarController::class, 'company'])->middleware('auth:sanctum');

